import { Order } from '../models/Order.js';
import { Product } from '../models/Product.js';
import { Notification } from '../models/Notification.js';
import { notifyAdmins, notifySeller, notifyProductStock, notifyProductUpdated } from '../config/socket.js';
import { sendOrderConfirmationEmail } from '../services/emailService.js';
import { isAdminRole } from '../utils/roleUtils.js';

const generateOrderNumber = () => {
  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `VK-${dateStr}-${randomSuffix}`;
};

export const createOrder = async (req, res, next) => {
  try {
    const { customerName, customerPhone, customerEmail, deliveryAddress, city, deliveryNotes, items, discount = 0, shippingCost = 0 } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ status: 'error', message: 'La commande doit comporter au moins un article.' });
    }
    if (!customerName || !customerPhone || !deliveryAddress) {
      return res.status(400).json({ status: 'error', message: 'Les informations du client sont obligatoires.' });
    }

    const enrichedItems = [];
    let calculatedSubtotal = 0;

    // 1. Vérification préalable et stricte de la disponibilité des stocks (Anti-Race Condition)
    for (const item of items) {
      const product = item.productId ? await Product.findById(item.productId) : await Product.findOne({ title: item.title });
      const quantity = Math.max(1, Number(item.quantity) || 1);

      if (product) {
        if (product.stockQuantity < quantity) {
          return res.status(400).json({
            status: 'error',
            message: `Stock insuffisant pour "${product.title}". Quantité restante en stock : ${product.stockQuantity}.`,
          });
        }
      }

      const price = product ? product.price : (Number(item.price) || 0);
      const sellerId = product && product.seller ? product.seller : null;
      const sellerName = product && product.sellerName ? product.sellerName : 'Vicky-Shop';

      calculatedSubtotal += price * quantity;
      enrichedItems.push({
        productId: product ? product._id : (item.productId || null),
        sellerId,
        sellerName,
        title: product ? product.title : item.title,
        price,
        quantity,
        image: item.image || (product ? product.image : ''),
        size: item.size || '',
        color: item.color || '',
        status: 'en_attente',
      });
    }

    const calculatedTotal = Math.max(0, calculatedSubtotal - (Number(discount) || 0) + (Number(shippingCost) || 0));
    const orderNumber = generateOrderNumber();

    const order = await Order.create({
      customerId: req.user ? req.user._id : null,
      orderNumber,
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      customerEmail: customerEmail ? customerEmail.toLowerCase().trim() : '',
      deliveryAddress: deliveryAddress.trim(),
      city: city ? city.trim() : 'Abidjan',
      deliveryNotes: deliveryNotes ? deliveryNotes.trim() : '',
      items: enrichedItems,
      subtotal: calculatedSubtotal,
      discount: Number(discount) || 0,
      shippingCost: Number(shippingCost) || 0,
      total: calculatedTotal,
      amountToCollect: calculatedTotal,
      paymentMethod: 'livraison',
      paymentStatus: 'en_attente',
      orderStatus: 'recue',
      statusHistory: [{ status: 'recue', updatedAt: new Date(), comment: 'Commande passée (Paiement espèces à la livraison).' }],
    });

    // 2. Déduction atomique des stocks
    for (const item of enrichedItems) {
      if (item.productId) {
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
        } catch (sErr) {
          console.error('[Stock Error]', sErr.message);
        }
      }
    }

    try { notifyAdmins('order:new', order); } catch (e) {}

    // Groupement et notifications ciblées en BDD et WebSocket par vendeur
    const sellersMap = {};
    enrichedItems.forEach((item) => {
      if (item.sellerId) {
        const sId = item.sellerId.toString();
        if (!sellersMap[sId]) sellersMap[sId] = [];
        sellersMap[sId].push(item);
      }
    });

    for (const [sId, sellerItems] of Object.entries(sellersMap)) {
      const sellerSubtotal = sellerItems.reduce((acc, i) => acc + i.price * i.quantity, 0);
      const itemsListStr = sellerItems.map((i) => `${i.quantity}x ${i.title}`).join(', ');

      Notification.create({
        sellerId: sId,
        orderId: order._id,
        orderNumber: order.orderNumber,
        title: 'Nouvelle commande reçue',
        message: `Le client ${order.customerName} a commandé : ${itemsListStr} (Total : ${sellerSubtotal} FCFA).`,
        type: 'order_new',
      }).catch((nErr) => console.warn('[Notification] Erreur création :', nErr));

      try {
        notifySeller(sId, 'order:seller:new', {
          orderId: order._id,
          orderNumber: order.orderNumber,
          customerName: order.customerName,
          customerPhone: order.customerPhone,
          city: order.city,
          deliveryAddress: order.deliveryAddress,
          items: sellerItems,
          total: sellerSubtotal,
          amountToCollect: sellerSubtotal,
          createdAt: order.createdAt,
        });
      } catch (err) {}
    }

    if (order.customerEmail) {
      sendOrderConfirmationEmail(order).catch(() => {});
    }

    res.status(201).json({
      status: 'success',
      message: 'Commande enregistrée avec succès. Paiement prévu en espèces à la livraison.',
      data: { order },
    });
  } catch (error) {
    next(error);
  }
};

export const getOrderByNumber = async (req, res, next) => {
  try {
    const order = await Order.findOne({ orderNumber: req.params.orderNumber });
    if (!order) return res.status(404).json({ status: 'error', message: 'Commande introuvable.' });
    res.status(200).json({ status: 'success', data: { order } });
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
        _id: order._id,
        orderNumber: order.orderNumber,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        deliveryAddress: order.deliveryAddress,
        city: order.city,
        items: sellerItems,
        sellerTotal,
        amountToCollect: sellerTotal,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        orderStatus: order.orderStatus,
        statusHistory: order.statusHistory || [],
      };
    });

    res.status(200).json({ status: 'success', results: sellerOrders.length, data: { orders: sellerOrders } });
  } catch (error) { next(error); }
};

export const updateSellerOrderItemStatus = async (req, res, next) => {
  try {
    const { orderId, itemId } = req.params;
    const { status } = req.body;

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ status: 'error', message: 'Commande introuvable.' });

    const item = order.items.id(itemId);
    if (!item) return res.status(404).json({ status: 'error', message: 'Article introuvable.' });

    if (!isAdminRole(req.user.role) && (!item.sellerId || item.sellerId.toString() !== req.user._id.toString())) {
      return res.status(403).json({ status: 'error', message: 'Accès refusé. Vous ne pouvez modifier que vos propres articles.' });
    }

    const prevStatus = item.status || 'en_attente';
    item.status = status;

    order.statusHistory.push({
      status: `Article "${item.title}" : passage de [${prevStatus}] à [${status}]`,
      updatedAt: new Date(),
      comment: `Mis à jour par ${req.user.name} (${req.user.role === 'vendeur' ? 'Vendeur' : 'Admin'})`,
    });
    await order.save();

    res.status(200).json({ status: 'success', message: 'Statut de l\'article mis à jour avec succès.', data: { order } });
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
      comment: `Encaissement validé par ${req.user.name}.`,
    });
    await order.save();

    res.status(200).json({ status: 'success', message: 'Encaissement confirmé avec succès.', data: { order } });
  } catch (error) { next(error); }
};
