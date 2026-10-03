import { Product } from '../models/Product.js';
import { Order } from '../models/Order.js';
import { User } from '../models/User.js';
import { Notification } from '../models/Notification.js';
import { ROLES, normalizeRole } from '../utils/roleUtils.js';
import { uploadBufferToCloudinary, isCloudinaryConfigured } from '../services/cloudinaryService.js';

/**
 * Récupère les métriques consolidées du tableau de bord vendeur.
 */
export const getSellerDashboardStats = async (req, res, next) => {
  try {
    const sellerId = req.user._id;

    const [
      totalProducts,
      activeProducts,
      outOfStockProducts,
      lowStockProducts,
      recentProducts,
      unreadNotificationsCount,
    ] = await Promise.all([
      Product.countDocuments({ seller: sellerId, isArchived: { $ne: true } }),
      Product.countDocuments({ seller: sellerId, isActive: { $ne: false }, isArchived: { $ne: true } }),
      Product.countDocuments({ seller: sellerId, stockQuantity: { $lte: 0 }, isArchived: { $ne: true } }),
      Product.countDocuments({ seller: sellerId, stockQuantity: { $gt: 0, $lte: 5 }, isArchived: { $ne: true } }),
      Product.find({ seller: sellerId, isArchived: { $ne: true } }).sort({ createdAt: -1 }).limit(5),
      Notification.countDocuments({ sellerId, isRead: false }),
    ]);

    const sellerOrders = await Order.find({ 'items.sellerId': sellerId }).sort({ createdAt: -1 });

    let newOrdersCount = 0;
    let inProgressOrdersCount = 0;
    let deliveredOrdersCount = 0;
    let cancelledOrdersCount = 0;
    let amountToCollect = 0;
    let amountCollected = 0;

    const recentOrders = [];

    sellerOrders.forEach((order, index) => {
      const sellerItems = order.items.filter(
        (i) => i.sellerId && i.sellerId.toString() === sellerId.toString()
      );
      const itemsSum = sellerItems.reduce((acc, i) => acc + i.price * i.quantity, 0);

      if (order.paymentStatus === 'paye') {
        amountCollected += itemsSum;
      } else {
        amountToCollect += itemsSum;
      }

      if (order.orderStatus === 'recue' || sellerItems.some((i) => i.status === 'en_attente')) {
        newOrdersCount += 1;
      } else if (order.orderStatus === 'en_preparation' || order.orderStatus === 'en_livraison') {
        inProgressOrdersCount += 1;
      } else if (order.orderStatus === 'livree') {
        deliveredOrdersCount += 1;
      } else if (order.orderStatus === 'annulee') {
        cancelledOrdersCount += 1;
      }

      if (index < 5) {
        recentOrders.push({
          _id: order._id,
          orderNumber: order.orderNumber,
          customerName: order.customerName,
          customerPhone: order.customerPhone,
          city: order.city,
          createdAt: order.createdAt,
          itemsCount: sellerItems.length,
          total: itemsSum,
          orderStatus: order.orderStatus,
          paymentStatus: order.paymentStatus,
        });
      }
    });

    res.status(200).json({
      status: 'success',
      data: {
        stats: {
          totalProducts,
          activeProducts,
          outOfStockProducts,
          lowStockProducts,
          totalOrdersCount: sellerOrders.length,
          newOrdersCount,
          inProgressOrdersCount,
          deliveredOrdersCount,
          cancelledOrdersCount,
          amountToCollect,
          amountCollected,
          totalSales: amountCollected + amountToCollect,
          unreadNotificationsCount,
          recentOrders,
          recentProducts,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Récupère les notifications ciblées du vendeur.
 */
export const getSellerNotifications = async (req, res, next) => {
  try {
    const notifications = await Notification.find({ sellerId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(50);
    const unreadCount = await Notification.countDocuments({ sellerId: req.user._id, isRead: false });

    res.status(200).json({
      status: 'success',
      data: { notifications, unreadCount },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Marque une notification spécifique comme lue.
 */
export const markNotificationAsRead = async (req, res, next) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, sellerId: req.user._id },
      { $set: { isRead: true } },
      { new: true }
    );
    res.status(200).json({ status: 'success', data: { notification } });
  } catch (error) {
    next(error);
  }
};

/**
 * Marque toutes les notifications du vendeur comme lues.
 */
export const markAllNotificationsAsRead = async (req, res, next) => {
  try {
    await Notification.updateMany({ sellerId: req.user._id, isRead: false }, { $set: { isRead: true } });
    res.status(200).json({ status: 'success', message: 'Toutes les notifications ont été marquées comme lues.' });
  } catch (error) {
    next(error);
  }
};

/**
 * Récupère le profil public et commercial de la boutique du vendeur.
 */
export const getSellerProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ status: 'error', message: 'Vendeur introuvable.' });

    res.status(200).json({
      status: 'success',
      data: {
        shop: {
          shopName: user.shopName || `${user.name} Boutique`,
          shopDescription: user.shopDescription || '',
          shopPhone: user.shopPhone || user.phone || '',
          shopAddress: user.shopAddress || user.address || '',
          isSellerActive: user.isSellerActive !== false,
          role: normalizeRole(user.role),
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Met à jour les paramètres de la boutique du vendeur.
 */
export const updateSellerProfile = async (req, res, next) => {
  try {
    const { shopName, shopDescription, shopPhone, shopAddress } = req.body;
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ status: 'error', message: 'Vendeur introuvable.' });

    if (shopName) user.shopName = shopName.trim();
    if (shopDescription !== undefined) user.shopDescription = shopDescription.trim();
    if (shopPhone !== undefined) user.shopPhone = shopPhone.trim();
    if (shopAddress !== undefined) user.shopAddress = shopAddress.trim();

    await user.save();

    res.status(200).json({
      status: 'success',
      message: 'Informations de boutique mises à jour avec succès.',
      data: {
        shop: {
          shopName: user.shopName,
          shopDescription: user.shopDescription,
          shopPhone: user.shopPhone,
          shopAddress: user.shopAddress,
          isSellerActive: user.isSellerActive,
          role: normalizeRole(user.role),
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Permet à un utilisateur client de passer au rôle Vendeur Pro.
 */
export const upgradeToSeller = async (req, res, next) => {
  try {
    const { shopName, shopPhone, shopAddress, shopDescription } = req.body;
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ status: 'error', message: 'Utilisateur introuvable.' });

    user.role = ROLES.VENDEUR;
    user.shopName = shopName ? shopName.trim() : `${user.name} Boutique`;
    user.shopPhone = shopPhone ? shopPhone.trim() : user.phone;
    user.shopAddress = shopAddress ? shopAddress.trim() : user.address;
    if (shopDescription) user.shopDescription = shopDescription.trim();
    user.isSellerActive = true;

    await user.save();

    res.status(200).json({
      status: 'success',
      message: 'Félicitations ! Votre compte est désormais un compte Vendeur Marketplace.',
      data: {
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: normalizeRole(user.role),
          shopName: user.shopName,
          shopDescription: user.shopDescription,
          shopPhone: user.shopPhone,
          shopAddress: user.shopAddress,
          isSellerActive: user.isSellerActive,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Téléverse une image de produit pour le vendeur (Cloudinary ou Base64 fallback).
 */
export const uploadSellerProductImage = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        status: 'error',
        message: 'Aucun fichier image fourni.',
      });
    }

    if (isCloudinaryConfigured()) {
      const result = await uploadBufferToCloudinary(
        req.file.buffer,
        `seller_${req.user._id}_${Date.now()}`,
        'seller_products'
      );
      return res.status(200).json({
        status: 'success',
        message: 'Image téléversée avec succès sur Cloudinary.',
        data: {
          url: result.secure_url || result.url,
          publicId: result.public_id,
        },
      });
    }

    const mime = req.file.mimetype || 'image/jpeg';
    const base64Data = `data:${mime};base64,${req.file.buffer.toString('base64')}`;

    res.status(200).json({
      status: 'success',
      message: 'Image importée avec succès.',
      data: {
        url: base64Data,
        publicId: null,
      },
    });
  } catch (error) {
    next(error);
  }
};


