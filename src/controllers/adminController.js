import { Order } from '../models/Order.js';
import { Product } from '../models/Product.js';
import { User } from '../models/User.js';
import { ShopSettings } from '../models/ShopSettings.js';
import { notifyAdmins, notifyOrderUpdate } from '../config/socket.js';
import { sendOrderStatusUpdateEmail } from '../services/emailService.js';

/**
 * Controleur principal du Backoffice Administrateur pour Vicky-Shop.
 * Centralise les flux de donnees KPI, Commandes, Produits, Clients et Parametres.
 */

/**
 * Recupere l'ensemble des indicateurs cles de performance (KPIs) et finances.
 */
export const getDashboardKPIs = async (req, res, next) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 1. Agregat financier : Chiffre d'affaires global et commandes
    const ordersStats = await Order.aggregate([
      {
        $group: {
          _id: null,
          totalRevenue: {
            $sum: {
              $cond: [{ $ne: ['$orderStatus', 'annulee'] }, '$total', 0],
            },
          },
          totalOrders: { $sum: 1 },
          deliveredOrders: {
            $sum: { $cond: [{ $eq: ['$orderStatus', 'livree'] }, 1, 0] },
          },
          pendingOrders: {
            $sum: {
              $cond: [
                { $in: ['$orderStatus', ['recue', 'en_preparation', 'en_livraison']] },
                1,
                0,
              ],
            },
          },
          cancelledOrders: {
            $sum: { $cond: [{ $eq: ['$orderStatus', 'annulee'] }, 1, 0] },
          },
        },
      },
    ]);

    // 2. Chiffre d'affaires du jour
    const todayRevenueStats = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: today },
          orderStatus: { $ne: 'annulee' },
        },
      },
      {
        $group: {
          _id: null,
          todayRevenue: { $sum: '$total' },
          todayOrdersCount: { $sum: 1 },
        },
      },
    ]);

    const stats = ordersStats[0] || {
      totalRevenue: 0,
      totalOrders: 0,
      deliveredOrders: 0,
      pendingOrders: 0,
      cancelledOrders: 0,
    };

    const todayStats = todayRevenueStats[0] || {
      todayRevenue: 0,
      todayOrdersCount: 0,
    };

    const averageCart =
      stats.totalOrders > 0
        ? Math.round(stats.totalRevenue / Math.max(1, stats.totalOrders - stats.cancelledOrders))
        : 0;

    // 3. Statistiques clients et produits
    const totalCustomers = await User.countDocuments({ role: 'customer' });
    const totalProducts = await Product.countDocuments();
    const outOfStockProducts = await Product.countDocuments({
      $or: [{ inStock: false }, { stockQuantity: { $lte: 0 } }],
    });

    // 4. Repartition des ventes par categorie
    const categoryBreakdown = await Order.aggregate([
      { $match: { orderStatus: { $ne: 'annulee' } } },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.title',
          totalSold: { $sum: '$items.quantity' },
          totalAmount: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
        },
      },
      { $sort: { totalSold: -1 } },
      { $limit: 6 },
    ]);

    // 5. 5 dernieres commandes
    const recentOrders = await Order.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    res.status(200).json({
      status: 'success',
      data: {
        kpis: {
          totalRevenue: stats.totalRevenue,
          todayRevenue: todayStats.todayRevenue,
          todayOrdersCount: todayStats.todayOrdersCount,
          totalOrders: stats.totalOrders,
          pendingOrders: stats.pendingOrders,
          deliveredOrders: stats.deliveredOrders,
          cancelledOrders: stats.cancelledOrders,
          averageCart,
          totalCustomers,
          totalProducts,
          outOfStockProducts,
        },
        categoryBreakdown,
        recentOrders,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Recupere la liste des commandes avec filtres et recherche.
 */
export const getAllOrders = async (req, res, next) => {
  try {
    const { status, search, limit = 50, page = 1 } = req.query;

    const query = {};

    if (status && status !== 'all') {
      query.orderStatus = status;
    }

    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), 'i');
      query.$or = [
        { orderNumber: searchRegex },
        { customerName: searchRegex },
        { customerPhone: searchRegex },
        { customerEmail: searchRegex },
      ];
    }

    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    const [orders, total] = await Promise.all([
      Order.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit, 10))
        .lean(),
      Order.countDocuments(query),
    ]);

    res.status(200).json({
      status: 'success',
      results: orders.length,
      total,
      data: {
        orders,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Réintègre le stock des produits si une commande est annulée / refusée.
 */
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
      }
    } catch (err) {
      console.error(`[Stock] Erreur réintégration stock pour ${item.title} :`, err.message);
    }
  }
};

/**
 * Met à jour le statut d'une commande et de son paiement avec historique, stock et alertes.
 */
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
      order.orderStatus = orderStatus;

      // Si la commande passe à "livrée" et moyen de paiement cash, valider le paiement
      if (
        orderStatus === 'livree' &&
        !paymentStatus &&
        (order.paymentMethod === 'livraison' || order.paymentMethod === 'cash')
      ) {
        order.paymentStatus = 'paye';
      }

      // Si la commande est annulée / refusée, remettre les articles en stock
      if (orderStatus === 'annulee' && previousStatus !== 'annulee') {
        restoreProductsStock(order.items).catch((err) =>
          console.error('[Admin] Erreur réintégration stock :', err)
        );
      }

      // Enregistrement dans l'historique
      if (!order.statusHistory) {
        order.statusHistory = [];
      }
      order.statusHistory.push({
        status: orderStatus,
        updatedAt: new Date(),
        comment: comment || `Statut passé de '${previousStatus}' à '${orderStatus}' par l'administration.`,
      });
    }

    if (paymentStatus) {
      order.paymentStatus = paymentStatus;
    }

    await order.save();

    // 1. Diffusion en temps réel vers le Dashboard Admin
    try {
      notifyAdmins('order:updated', order);
      notifyOrderUpdate(order.orderNumber, 'order:updated', order);
    } catch (socketErr) {
      console.warn('[Socket.IO] Erreur notification update :', socketErr.message);
    }

    // 2. Notification Brevo au client si le statut a changé
    if (orderStatus && orderStatus !== previousStatus && order.customerEmail) {
      sendOrderStatusUpdateEmail(order, orderStatus).catch((err) => {
        console.error('[Email] Échec envoi email mise à jour statut :', err.message);
      });
    }

    res.status(200).json({
      status: 'success',
      message: 'Statut de la commande mis à jour avec succès.',
      data: {
        order,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Recupere la liste des produits avec options d'administration.
 */
export const getAllProducts = async (req, res, next) => {
  try {
    const { category, search } = req.query;
    const query = {};

    if (category && category !== 'all') {
      query.category = category.toLowerCase();
    }

    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), 'i');
      query.$or = [{ title: searchRegex }, { description: searchRegex }];
    }

    const products = await Product.find(query).sort({ createdAt: -1 }).lean();

    res.status(200).json({
      status: 'success',
      results: products.length,
      data: {
        products,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Cree un nouveau produit dans le catalogue.
 */
export const createProduct = async (req, res, next) => {
  try {
    const {
      title,
      description,
      price,
      originalPrice,
      category,
      image,
      badge,
      inStock,
      stockQuantity,
    } = req.body;

    const product = await Product.create({
      title,
      description: description || '',
      price: Number(price),
      originalPrice: originalPrice ? Number(originalPrice) : null,
      category: category ? category.toLowerCase() : 'vetements',
      image,
      badge: badge || null,
      inStock: inStock !== undefined ? Boolean(inStock) : true,
      stockQuantity: stockQuantity !== undefined ? Number(stockQuantity) : 10,
    });

    res.status(201).json({
      status: 'success',
      message: 'Produit ajoute avec succes au catalogue.',
      data: {
        product,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Met a jour un produit existant.
 */
export const updateProduct = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    if (updates.category) {
      updates.category = updates.category.toLowerCase();
    }
    if (updates.price !== undefined) {
      updates.price = Number(updates.price);
    }
    if (updates.originalPrice !== undefined) {
      updates.originalPrice = updates.originalPrice ? Number(updates.originalPrice) : null;
    }
    if (updates.stockQuantity !== undefined) {
      updates.stockQuantity = Number(updates.stockQuantity);
    }

    const product = await Product.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    });

    if (!product) {
      return res.status(404).json({
        status: 'error',
        message: 'Produit introuvable.',
      });
    }

    res.status(200).json({
      status: 'success',
      message: 'Produit mis a jour avec succes.',
      data: {
        product,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Supprime un produit du catalogue.
 */
export const deleteProduct = async (req, res, next) => {
  try {
    const { id } = req.params;
    const product = await Product.findByIdAndDelete(id);

    if (!product) {
      return res.status(404).json({
        status: 'error',
        message: 'Produit introuvable.',
      });
    }

    res.status(200).json({
      status: 'success',
      message: 'Produit supprime du catalogue avec succes.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Bascule la disponibilite en stock d'un produit en un clic.
 */
export const toggleProductStock = async (req, res, next) => {
  try {
    const { id } = req.params;
    const product = await Product.findById(id);

    if (!product) {
      return res.status(404).json({
        status: 'error',
        message: 'Produit introuvable.',
      });
    }

    product.inStock = !product.inStock;
    await product.save();

    res.status(200).json({
      status: 'success',
      message: `Statut de stock mis a jour (${product.inStock ? 'En stock' : 'Rupture de stock'}).`,
      data: {
        product,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Recupere la liste des clients inscrits avec historique d'achats.
 */
export const getAllUsers = async (req, res, next) => {
  try {
    const users = await User.find({ role: 'customer' })
      .select('-password')
      .sort({ createdAt: -1 })
      .lean();

    // Calcul du nombre de commandes et du total depense par chaque client
    const userEmails = users.map((u) => u.email.toLowerCase());
    const userPhones = users.map((u) => u.phone);

    const userOrdersAggregation = await Order.aggregate([
      {
        $match: {
          $or: [
            { customerEmail: { $in: userEmails } },
            { customerPhone: { $in: userPhones } },
          ],
          orderStatus: { $ne: 'annulee' },
        },
      },
      {
        $group: {
          _id: { $toLower: '$customerEmail' },
          ordersCount: { $sum: 1 },
          totalSpent: { $sum: '$total' },
        },
      },
    ]);

    const orderMap = {};
    userOrdersAggregation.forEach((item) => {
      if (item._id) {
        orderMap[item._id] = {
          ordersCount: item.ordersCount,
          totalSpent: item.totalSpent,
        };
      }
    });

    const enrichedUsers = users.map((u) => {
      const stats = orderMap[u.email.toLowerCase()] || { ordersCount: 0, totalSpent: 0 };
      return {
        ...u,
        ordersCount: stats.ordersCount,
        totalSpent: stats.totalSpent,
      };
    });

    res.status(200).json({
      status: 'success',
      results: enrichedUsers.length,
      data: {
        users: enrichedUsers,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Recupere les parametres de la boutique.
 */
export const getShopSettings = async (req, res, next) => {
  try {
    const settings = await ShopSettings.getSettings();
    res.status(200).json({
      status: 'success',
      data: {
        settings,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Met a jour les parametres de la boutique.
 */
export const updateShopSettings = async (req, res, next) => {
  try {
    const updates = req.body;
    let settings = await ShopSettings.findOne();

    if (!settings) {
      settings = await ShopSettings.create(updates);
    } else {
      Object.assign(settings, updates);
      await settings.save();
    }

    res.status(200).json({
      status: 'success',
      message: 'Parametres de la boutique mis a jour avec succes.',
      data: {
        settings,
      },
    });
  } catch (error) {
    next(error);
  }
};
