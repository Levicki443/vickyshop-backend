import { Order } from '../models/Order.js';
import { Product } from '../models/Product.js';
import {
  notifyAdmins,
  notifyOrderUpdate,
  notifyProductStock,
  notifyProductUpdated,
} from '../config/socket.js';
import { sendOrderStatusUpdateEmail } from '../services/emailService.js';
import { securityLog } from '../utils/securityLogger.js';
import {
  isValidStateTransition,
  shouldRestoreStockOnTransition,
} from '../utils/orderStateMachine.js';

const restoreProductsStock = async (items) => {
  if (!items || !Array.isArray(items)) return;
  for (const item of items) {
    try {
      let product = null;
      if (item.productId) {
        product = await Product.findById(item.productId);
      }
      if (!product && item.title) {
        product = await Product.findOne({ title: item.title });
      }
      if (product) {
        product.stockQuantity = (product.stockQuantity || 0) + item.quantity;
        if (product.stockQuantity > 0) {
          product.inStock = true;
        }
        await product.save();

        try {
          notifyProductStock(product._id, product.stockQuantity, product.inStock);
          notifyProductUpdated(product);
        } catch (sErr) {}
      }
    } catch (err) {
      console.error(`[Stock] Erreur réintégration stock pour ${item.title} :`, err.message);
    }
  }
};

export const getAllOrders = async (req, res, next) => {
  try {
    const { status, search, limit = 50, page = 1 } = req.query;
    const query = {};

    if (status && status !== 'all') {
      query.orderStatus = status;
    }

    if (search && typeof search === 'string' && search.trim()) {
      const sanitizedSearch = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const searchRegex = new RegExp(sanitizedSearch, 'i');
      query.$or = [
        { orderNumber: searchRegex },
        { customerName: searchRegex },
        { customerPhone: searchRegex },
        { customerEmail: searchRegex },
      ];
    }

    const skip = (Math.max(1, parseInt(page, 10)) - 1) * Math.min(100, Math.max(1, parseInt(limit, 10)));
    const actualLimit = Math.min(100, Math.max(1, parseInt(limit, 10)));

    const [orders, total] = await Promise.all([
      Order.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(actualLimit)
        .lean(),
      Order.countDocuments(query),
    ]);

    res.status(200).json({
      status: 'success',
      results: orders.length,
      total,
      data: { orders },
    });
  } catch (error) {
    next(error);
  }
};

export const updateOrderStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { orderStatus, paymentStatus, comment } = req.body;

    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({
        status: 'error',
        message: 'Commande introuvable.',
      });
    }

    const previousStatus = order.orderStatus;

    if (orderStatus) {
      // Validation de la transition via la machine à états finis
      if (!isValidStateTransition(previousStatus, orderStatus)) {
        return res.status(400).json({
          status: 'error',
          message: `Transition d'état invalide : impossible de passer de '${previousStatus}' à '${orderStatus}'.`,
        });
      }

      order.orderStatus = orderStatus;

      // Si la commande passe à "livrée" et moyen de paiement cash, valider le paiement
      if (
        orderStatus === 'livree' &&
        !paymentStatus &&
        (order.paymentMethod === 'livraison' || order.paymentMethod === 'cash')
      ) {
        order.paymentStatus = 'paye';
      }

      // Réintégration du stock uniquement si la transition le justifie (Anti-Double Restore)
      if (shouldRestoreStockOnTransition(previousStatus, orderStatus)) {
        restoreProductsStock(order.items).catch((err) =>
          console.error('[Admin] Erreur réintégration stock :', err)
        );
      }

      if (!order.statusHistory) {
        order.statusHistory = [];
      }
      order.statusHistory.push({
        status: orderStatus,
        updatedAt: new Date(),
        comment: comment || `Statut passé de '${previousStatus}' à '${orderStatus}' par l'administrateur.`,
      });
    }

    if (paymentStatus) {
      order.paymentStatus = paymentStatus;
    }

    await order.save();

    try {
      notifyAdmins('order:updated', order);
      notifyOrderUpdate(order.orderNumber, 'order:updated', order);
    } catch (socketErr) {}

    if (orderStatus && orderStatus !== previousStatus && order.customerEmail) {
      sendOrderStatusUpdateEmail(order, orderStatus).catch((err) => {
        console.error('[Email] Échec envoi email mise à jour statut :', err.message);
      });
    }

    securityLog.orderStatusChanged({
      orderNumber: order.orderNumber,
      previousStatus,
      newStatus: orderStatus || previousStatus,
      changedByUserId: req.user._id,
      ip: req.ip,
    });

    res.status(200).json({
      status: 'success',
      message: 'Statut de la commande mis à jour avec succès.',
      data: { order },
    });
  } catch (error) {
    next(error);
  }
};
