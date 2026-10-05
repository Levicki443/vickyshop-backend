import { User } from '../models/User.js';
import { Order } from '../models/Order.js';
import { ShopSettings } from '../models/ShopSettings.js';
import { securityLog } from '../utils/securityLogger.js';
import { notifySettingsUpdated } from '../config/socket.js';

export const getAllUsers = async (req, res, next) => {
  try {
    const users = await User.find({ role: 'client' })
      .select('-password -passwordResetToken -passwordResetExpires -twoFactorCode')
      .sort({ createdAt: -1 })
      .lean();

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
      data: { users: enrichedUsers },
    });
  } catch (error) {
    next(error);
  }
};

export const getShopSettings = async (req, res, next) => {
  try {
    const settings = await ShopSettings.getSettings();
    res.status(200).json({
      status: 'success',
      data: { settings },
    });
  } catch (error) {
    next(error);
  }
};

export const updateShopSettings = async (req, res, next) => {
  try {
    const allowedFields = [
      'shopName', 'currency', 'freeShippingThreshold', 'defaultShippingCost',
      'announcementText', 'isAnnouncementActive', 'activePromoCode', 'promoDiscountPercent',
      'whatsappNumber', 'isShopOpen', 'contactEmail',
    ];

    const updates = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    let settings = await ShopSettings.findOne();
    if (!settings) {
      settings = await ShopSettings.create(updates);
    } else {
      Object.assign(settings, updates);
      await settings.save();
    }

    try {
      notifySettingsUpdated(settings);
    } catch (socketErr) {
      console.warn('[Socket.IO] Erreur diffusion mise à jour paramètres :', socketErr.message);
    }

    securityLog.adminAction({
      action: 'MISE_A_JOUR_PARAMETRES_BOUTIQUE',
      targetResource: 'ShopSettings',
      userId: req.user._id,
      details: updates,
      ip: req.ip,
    });

    res.status(200).json({
      status: 'success',
      message: 'Paramètres de la boutique mis à jour avec succès.',
      data: { settings },
    });
  } catch (error) {
    next(error);
  }
};
