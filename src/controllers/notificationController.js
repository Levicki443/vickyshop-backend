import { Notification } from '../models/Notification.js';
import { User } from '../models/User.js';
import { getVapidPublicKey } from '../services/pushNotificationService.js';
import { sanitizeText } from '../utils/xssSanitizer.js';

/**
 * Récupère les notifications de l'utilisateur connecté (Client ou Vendeur) avec pagination et filtres.
 * Isolation stricte : Un utilisateur ne peut voir que les notifications dont il est le destinataire.
 */
export const getNotifications = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { category, unreadOnly, page = 1, limit = 30 } = req.query;

    const query = {
      $or: [{ userId }, { sellerId: userId }],
    };

    if (unreadOnly === 'true' || unreadOnly === true) {
      query.isRead = false;
    }

    if (category && category !== 'all') {
      if (category === 'orders') {
        query.type = { $in: ['order_new', 'order_status', 'order_confirmed', 'order_in_preparation', 'order_shipped', 'order_delivered'] };
      } else if (category === 'products') {
        query.type = { $in: ['new_product', 'price_drop', 'promo_ending', 'stock_alert'] };
      } else if (category === 'system') {
        query.type = 'system';
      }
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 30));
    const skip = (pageNum - 1) * limitNum;

    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Notification.countDocuments(query),
      Notification.countDocuments({
        $or: [{ userId }, { sellerId: userId }],
        isRead: false,
      }),
    ]);

    res.status(200).json({
      status: 'success',
      data: {
        notifications,
        total,
        unreadCount,
        page: pageNum,
        totalPages: Math.ceil(total / limitNum) || 1,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Marque une notification spécifique comme lue (Protection Anti-IDOR stricte).
 */
export const markNotificationRead = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const notification = await Notification.findOneAndUpdate(
      {
        _id: id,
        $or: [{ userId }, { sellerId: userId }],
      },
      {
        $set: { isRead: true, readAt: new Date() },
      },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({
        status: 'error',
        message: 'Notification introuvable ou vous n\'en êtes pas le destinataire.',
      });
    }

    res.status(200).json({
      status: 'success',
      data: { notification },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Marque toutes les notifications de l'utilisateur comme lues.
 */
export const markAllNotificationsRead = async (req, res, next) => {
  try {
    const userId = req.user._id;

    await Notification.updateMany(
      {
        $or: [{ userId }, { sellerId: userId }],
        isRead: false,
      },
      {
        $set: { isRead: true, readAt: new Date() },
      }
    );

    res.status(200).json({
      status: 'success',
      message: 'Toutes vos notifications ont été marquées comme lues.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Supprime une notification avec vérification stricte de propriété.
 */
export const deleteNotification = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const deleted = await Notification.findOneAndDelete({
      _id: id,
      $or: [{ userId }, { sellerId: userId }],
    });

    if (!deleted) {
      return res.status(404).json({
        status: 'error',
        message: 'Notification introuvable ou vous n\'avez pas l\'autorisation de la supprimer.',
      });
    }

    res.status(200).json({
      status: 'success',
      message: 'Notification supprimée avec succès.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Récupère les préférences de notifications de l'utilisateur connecté.
 */
export const getPreferences = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('notificationPreferences');
    res.status(200).json({
      status: 'success',
      data: {
        preferences: user?.notificationPreferences || {},
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Met à jour les préférences de notifications de l'utilisateur connecté.
 */
export const updatePreferences = async (req, res, next) => {
  try {
    const allowedKeys = [
      'orders',
      'delivery',
      'newProducts',
      'priceDrops',
      'promotions',
      'pushNotifications',
      'soundEnabled',
      'sellerNewOrders',
      'sellerOrderStatus',
      'sellerStockAlerts',
    ];

    const updates = {};
    for (const key of allowedKeys) {
      if (typeof req.body[key] === 'boolean') {
        updates[`notificationPreferences.${key}`] = req.body[key];
      }
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updates },
      { new: true }
    ).select('notificationPreferences');

    res.status(200).json({
      status: 'success',
      message: 'Préférences de notifications mises à jour.',
      data: {
        preferences: updatedUser.notificationPreferences,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Enregistre un abonnement Web Push (PWA / Navigateur).
 */
export const subscribePush = async (req, res, next) => {
  try {
    const { endpoint, keys, deviceType } = req.body;

    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({
        status: 'error',
        message: 'Paramètres d\'abonnement push invalides.',
      });
    }

    const cleanEndpoint = sanitizeText(endpoint);
    const cleanP256dh = sanitizeText(keys.p256dh);
    const cleanAuth = sanitizeText(keys.auth);
    const cleanDevice = deviceType ? sanitizeText(deviceType) : 'browser';

    // Évite les doublons d'endpoint
    await User.findByIdAndUpdate(req.user._id, {
      $pull: { pushSubscriptions: { endpoint: cleanEndpoint } },
    });

    await User.findByIdAndUpdate(req.user._id, {
      $push: {
        pushSubscriptions: {
          endpoint: cleanEndpoint,
          keys: { p256dh: cleanP256dh, auth: cleanAuth },
          deviceType: cleanDevice,
          createdAt: new Date(),
        },
      },
    });

    res.status(200).json({
      status: 'success',
      message: 'Abonnement aux notifications push enregistré avec succès.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Désabonne un appareil des notifications Web Push.
 */
export const unsubscribePush = async (req, res, next) => {
  try {
    const { endpoint } = req.body;
    if (endpoint) {
      await User.findByIdAndUpdate(req.user._id, {
        $pull: { pushSubscriptions: { endpoint } },
      });
    }

    res.status(200).json({
      status: 'success',
      message: 'Abonnement push révoqué.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Expose la clé publique VAPID pour le frontend.
 */
export const getVapidPublicKeyHandler = async (req, res) => {
  res.status(200).json({
    status: 'success',
    data: {
      publicKey: getVapidPublicKey(),
    },
  });
};
