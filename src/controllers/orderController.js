import { Order } from '../models/Order.js';
import { Product } from '../models/Product.js';
import { ShopSettings } from '../models/ShopSettings.js';
import { notifyAdmins, notifyOrderUpdate, notifyProductStock, notifyProductUpdated, notifyUser } from '../config/socket.js';
import { notifyOrderCreated, notifyOrderStatusChanged } from '../services/notificationService.js';
import { sendOrderConfirmationEmail } from '../services/emailService.js';
import { isAdminRole } from '../utils/roleUtils.js';
import { securityLog } from '../utils/securityLogger.js';
import { sanitizeText } from '../utils/xssSanitizer.js';
import { computeGlobalOrderStatusFromItems, isValidStateTransition } from '../utils/orderStateMachine.js';

const VALID_ITEM_STATUSES = ['en_attente', 'confirmee', 'en_preparation', 'expediee', 'en_livraison', 'livree', 'annulee', 'refusee', 'retournee'];

const generateOrderNumber = () => {
  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  return `VK-${dateStr}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
};

export const createOrder = async (req, res, next) => {
  try {
    const { customerName, customerPhone, customerEmail, deliveryAddress, city, deliveryNotes, items, promoCode } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ status: 'error', message: 'La commande doit comporter au moins un article.' });
    }
    if (!customerName || !customerPhone || !deliveryAddress) {
      return res.status(400).json({ status: 'error', message: 'Les informations du client sont obligatoires.' });
    }

    const cleanName = sanitizeText(customerName);
    const cleanPhone = customerPhone.replace(/[^\d+]/g, '').trim();
    const cleanAddress = sanitizeText(deliveryAddress);
    const cleanNotes = deliveryNotes ? sanitizeText(deliveryNotes) : '';

    const recentDuplicate = await Order.findOne({
      customerPhone: cleanPhone,
      createdAt: { $gte: new Date(Date.now() - 5000) },
    });
    if (recentDuplicate) {
      return res.status(200).json({ status: 'success', message: 'Commande déjà prise en compte.', data: { order: recentDuplicate } });
    }

    const settings = await ShopSettings.getSettings();
    if (!settings.isShopOpen) {
      return res.status(403).json({ status: 'error', message: 'La boutique est actuellement fermée aux nouvelles commandes.' });
    }

    const enrichedItems = [];
    let calculatedSubtotal = 0;

    for (const item of items) {
      if (!item.productId) return res.status(400).json({ status: 'error', message: 'Identifiant produit manquant.' });
      const product = await Product.findById(item.productId);
      if (!product || product.isArchived || product.isActive === false) {
        return res.status(400).json({ status: 'error', message: `Le produit "${item.title || item.productId}" n'est plus disponible.` });
      }

      const quantity = Math.max(1, parseInt(item.quantity, 10) || 1);
      if (product.stockQuantity < quantity) {
        return res.status(400).json({ status: 'error', message: `Stock insuffisant pour "${product.title}". Restant : ${product.stockQuantity}.` });
      }

      const verifiedPrice = Number(product.price);
      calculatedSubtotal += verifiedPrice * quantity;

      enrichedItems.push({
        productId: product._id,
        sellerId: product.seller || null,
        sellerName: product.sellerName || 'Vicky-Shop',
        title: product.title,
        price: verifiedPrice,
        quantity,
        image: product.image || item.image || '',
        size: typeof item.size === 'string' ? sanitizeText(item.size) : '',
        color: typeof item.color === 'string' ? sanitizeText(item.color) : '',
        status: 'en_attente',
      });
    }

    let calculatedDiscount = 0;
    if (promoCode && typeof promoCode === 'string') {
      const cleanCode = promoCode.trim().toUpperCase();
      if (settings.activePromoCode && cleanCode === settings.activePromoCode.toUpperCase()) {
        calculatedDiscount = Math.min(calculatedSubtotal, Math.round((calculatedSubtotal * (settings.promoDiscountPercent || 10)) / 100));
      }
    }

    let calculatedShipping = settings.defaultShippingCost || 2000;
    if (settings.freeShippingThreshold && calculatedSubtotal >= settings.freeShippingThreshold) {
      calculatedShipping = 0;
    }

    const calculatedTotal = Math.max(0, calculatedSubtotal - calculatedDiscount + calculatedShipping);
    const orderNumber = generateOrderNumber();

    const order = await Order.create({
      customerId: req.user ? req.user._id : null,
      orderNumber,
      customerName: cleanName,
      customerPhone: cleanPhone,
      customerEmail: customerEmail ? customerEmail.toLowerCase().trim() : '',
      deliveryAddress: cleanAddress,
      city: city ? sanitizeText(city) : 'Abidjan',
      deliveryNotes: cleanNotes,
      items: enrichedItems,
      subtotal: calculatedSubtotal,
      discount: calculatedDiscount,
      shippingCost: calculatedShipping,
      total: calculatedTotal,
      amountToCollect: calculatedTotal,
      paymentMethod: 'livraison',
      paymentStatus: 'en_attente',
      orderStatus: 'recue',
      statusHistory: [
        {
          previousStatus: 'INITIAL',
          newStatus: 'recue',
          status: 'recue',
          updatedAt: new Date(),
          changedBy: req.user ? req.user._id : null,
          changedByName: cleanName,
          changedByRole: req.user ? 'client' : 'systeme',
          comment: 'Commande passée avec succès (Paiement en espèces à la livraison).',
          orderNumber,
        },
      ],
    });

    for (const item of enrichedItems) {
      try {
        const updatedProd = await Product.findOneAndUpdate(
          { _id: item.productId, stockQuantity: { $gte: item.quantity } },
          { $inc: { stockQuantity: -item.quantity } },
          { new: true }
        );
        if (updatedProd) {
          if (updatedProd.stockQuantity <= 0) {
            updatedProd.inStock = false;
            await updatedProd.save();
          }
          notifyProductStock(updatedProd._id, updatedProd.stockQuantity, updatedProd.inStock);
          notifyProductUpdated(updatedProd);
        }
      } catch (sErr) {}
    }

    try { notifyAdmins('order:new', order); } catch (e) {}
    notifyOrderCreated(order).catch((err) => console.warn('[OrderController] Erreur dispatch notifs :', err.message));

    if (order.customerEmail) {
      sendOrderConfirmationEmail(order).catch(() => {});
    }

    securityLog.orderStatusChanged({ orderNumber: order.orderNumber, previousStatus: 'INITIAL', newStatus: 'recue', changedByUserId: req.user?._id || 'CLIENT_INVITE', ip: req.ip });

    res.status(201).json({
      status: 'success',
      message: 'Commande enregistrée avec succès. Paiement prévu en espèces à la livraison.',
      data: { order },
    });
  } catch (error) { next(error); }
};

export const getOrderByNumber = async (req, res, next) => {
  try {
    const rawOrderNum = req.params.orderNumber?.trim();
    const order = await Order.findOne({ orderNumber: rawOrderNum });
    if (!order) return res.status(404).json({ status: 'error', message: 'Commande introuvable.' });

    const isOwner = req.user && (
      isAdminRole(req.user.role) ||
      (order.customerId && order.customerId.toString() === req.user._id.toString()) ||
      order.customerEmail === req.user.email
    );

    if (isOwner) {
      return res.status(200).json({ status: 'success', data: { order } });
    }

    const sanitized = {
      orderNumber: order.orderNumber,
      orderStatus: order.orderStatus,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      city: order.city,
      total: order.total,
      subtotal: order.subtotal,
      shippingCost: order.shippingCost,
      statusHistory: order.statusHistory || [],
      createdAt: order.createdAt,
      itemsCount: order.items.length,
      items: order.items.map((i) => ({
        title: i.title, quantity: i.quantity, price: i.price, status: i.status,
        sellerName: i.sellerName, size: i.size, color: i.color, image: i.image,
      })),
    };

    res.status(200).json({ status: 'success', data: { order: sanitized } });
  } catch (error) { next(error); }
};

export const getMyOrders = async (req, res, next) => {
  try {
    const query = { $or: [{ customerId: req.user._id }, { customerEmail: req.user.email.toLowerCase() }, { customerPhone: req.user.phone }] };
    const orders = await Order.find(query).sort({ createdAt: -1 });
    res.status(200).json({ status: 'success', results: orders.length, data: { orders } });
  } catch (error) { next(error); }
};

export const getSellerOrders = async (req, res, next) => {
  try {
    const sellerId = req.user._id;
    const orders = await Order.find({ 'items.sellerId': sellerId }).sort({ createdAt: -1 });

    const sellerOrders = orders.map((order) => {
      const sellerItems = order.items.filter((item) => item.sellerId && item.sellerId.toString() === sellerId.toString());
      const sellerTotal = sellerItems.reduce((acc, item) => acc + item.price * item.quantity, 0);
      return {
        _id: order._id, orderNumber: order.orderNumber, createdAt: order.createdAt, updatedAt: order.updatedAt,
        customerName: order.customerName, customerPhone: order.customerPhone, deliveryAddress: order.deliveryAddress,
        city: order.city, items: sellerItems, sellerTotal, amountToCollect: sellerTotal, paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus, orderStatus: order.orderStatus, statusHistory: order.statusHistory || [],
      };
    });

    res.status(200).json({ status: 'success', results: sellerOrders.length, data: { orders: sellerOrders } });
  } catch (error) { next(error); }
};

export const updateSellerOrderItemStatus = async (req, res, next) => {
  try {
    const { orderId, itemId } = req.params;
    const { status, comment } = req.body;

    if (!VALID_ITEM_STATUSES.includes(status)) {
      return res.status(400).json({ status: 'error', message: `Statut invalide. Valeurs autorisées : ${VALID_ITEM_STATUSES.join(', ')}` });
    }

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ status: 'error', message: 'Commande introuvable.' });

    const item = order.items.id(itemId);
    if (!item) return res.status(404).json({ status: 'error', message: 'Article introuvable.' });

    if (!isAdminRole(req.user.role) && (!item.sellerId || item.sellerId.toString() !== req.user._id.toString())) {
      securityLog.accessDenied({ userId: req.user._id, role: req.user.role, route: req.originalUrl, method: 'PATCH', reason: 'Tentative de modification d\'un article tiers' });
      return res.status(403).json({ status: 'error', message: 'Accès refusé. Vous ne pouvez modifier que vos propres articles.' });
    }

    const prevStatus = item.status || 'en_attente';
    item.status = status;

    const previousGlobalStatus = order.orderStatus;
    const newGlobalStatus = computeGlobalOrderStatusFromItems(order.items);
    order.orderStatus = newGlobalStatus;

    order.statusHistory.push({
      previousStatus: prevStatus,
      newStatus: status,
      status: newGlobalStatus,
      updatedAt: new Date(),
      changedBy: req.user._id,
      changedByName: req.user.name,
      changedByRole: req.user.role === 'vendeur' ? 'vendeur' : 'admin',
      comment: comment || `Article "${item.title}" passé à "${status}" par ${req.user.name}.`,
      orderNumber: order.orderNumber,
    });
    await order.save();

    notifyOrderStatusChanged(order, newGlobalStatus, item.title).catch((e) => console.warn('[OrderController] Notif status update :', e.message));

    try {
      notifyOrderUpdate(order.orderNumber, 'order:updated', order);
      const updatePayload = {
        orderNumber: order.orderNumber, orderStatus: order.orderStatus,
        statusHistory: order.statusHistory, items: order.items, updatedAt: new Date(),
      };
      notifyOrderUpdate(order.orderNumber, 'order:status_updated', updatePayload);
      if (order.customerId) notifyUser(order.customerId.toString(), 'order:status_updated', updatePayload);
      notifyAdmins('order:updated', order);
    } catch (e) {}

    res.status(200).json({ status: 'success', message: 'Statut mis à jour avec succès.', data: { order } });
  } catch (error) { next(error); }
};

export const confirmOrderPayment = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ status: 'error', message: 'Commande introuvable.' });

    order.paymentStatus = 'paye';
    order.paidAt = new Date();
    order.paymentConfirmedBy = req.user._id;
    order.statusHistory.push({
      status: 'Paiement encaissé à la livraison',
      updatedAt: new Date(),
      comment: `Encaissement validé par l'administrateur ${req.user.name}.`,
    });
    await order.save();

    notifyOrderStatusChanged(order, 'livree', 'Paiement validé').catch(() => {});
    try {
      notifyOrderUpdate(order.orderNumber, 'order:updated', order);
      notifyAdmins('order:updated', order);
    } catch (e) {}

    securityLog.adminAction({ action: 'VALIDATION_PAIEMENT_COMMANDE', targetResource: 'Order', userId: req.user._id, details: { orderNumber: order.orderNumber, total: order.total }, ip: req.ip });
    res.status(200).json({ status: 'success', message: 'Encaissement confirmé avec succès.', data: { order } });
  } catch (error) { next(error); }
};
