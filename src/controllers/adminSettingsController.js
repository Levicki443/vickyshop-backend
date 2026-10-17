import { User } from '../models/User.js';
import { Order } from '../models/Order.js';
import { ShopSettings } from '../models/ShopSettings.js';
import { securityLog } from '../utils/securityLogger.js';
import { notifySettingsUpdated } from '../config/socket.js';

export const getAllUsers = async (req, res, next) => {
  try {
    const { search = '' } = req.query;
    const cleanSearch = typeof search === 'string' ? search.trim().toLowerCase() : '';

    // 1. Récupération de l'ensemble des comptes inscrits sur la plateforme (Clients, Vendeurs, Administrateurs)
    const registeredUsers = await User.find({})
      .select('-password -passwordResetToken -passwordResetExpires -twoFactorCode')
      .sort({ createdAt: -1 })
      .lean();

    // 2. Agrégation de l'ensemble des commandes pour identifier les acheteurs et leurs métriques
    const ordersAggregation = await Order.aggregate([
      {
        $match: {
          orderStatus: { $ne: 'annulee' },
        },
      },
      {
        $group: {
          _id: {
            $cond: [
              { $and: [{ $ne: ['$customerPhone', ''] }, { $ne: ['$customerPhone', null] }] },
              '$customerPhone',
              { $toLower: '$customerEmail' },
            ],
          },
          customerName: { $last: '$customerName' },
          customerEmail: { $last: '$customerEmail' },
          customerPhone: { $last: '$customerPhone' },
          city: { $last: '$city' },
          deliveryAddress: { $last: '$deliveryAddress' },
          ordersCount: { $sum: 1 },
          totalSpent: { $sum: '$total' },
          lastOrderDate: { $max: '$createdAt' },
        },
      },
      {
        $sort: { lastOrderDate: -1 },
      },
    ]);

    const phoneToOrderStats = new Map();
    const emailToOrderStats = new Map();

    ordersAggregation.forEach((orderClient) => {
      if (orderClient.customerPhone) {
        phoneToOrderStats.set(orderClient.customerPhone.trim(), orderClient);
      }
      if (orderClient.customerEmail) {
        emailToOrderStats.set(orderClient.customerEmail.toLowerCase().trim(), orderClient);
      }
    });

    const clientList = [];
    const matchedPhones = new Set();
    const matchedEmails = new Set();

    // 3. Traitement des utilisateurs inscrits avec leurs statistiques de commandes
    registeredUsers.forEach((user) => {
      const uPhone = user.phone ? user.phone.trim() : '';
      const uEmail = user.email ? user.email.toLowerCase().trim() : '';

      const stats =
        (uPhone && phoneToOrderStats.get(uPhone)) ||
        (uEmail && emailToOrderStats.get(uEmail)) ||
        null;

      if (uPhone) matchedPhones.add(uPhone);
      if (uEmail) matchedEmails.add(uEmail);

      const count = stats ? stats.ordersCount : 0;
      const spent = stats ? stats.totalSpent : 0;

      clientList.push({
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone || (stats ? stats.customerPhone : '') || '',
        city: user.city || (stats ? stats.city : 'Abidjan') || 'Abidjan',
        address: user.address || (stats ? stats.deliveryAddress : '') || '',
        role: user.role || 'client',
        isRegistered: true,
        ordersCount: count,
        orderCount: count,
        totalSpent: spent,
        createdAt: user.createdAt,
      });
    });

    // 4. Intégration des clients acheteurs n'ayant pas créé de compte utilisateur
    ordersAggregation.forEach((orderClient) => {
      const phone = orderClient.customerPhone ? orderClient.customerPhone.trim() : '';
      const email = orderClient.customerEmail ? orderClient.customerEmail.toLowerCase().trim() : '';

      const isAlreadyIncluded = (phone && matchedPhones.has(phone)) || (email && matchedEmails.has(email));

      if (!isAlreadyIncluded && (phone || email)) {
        const count = orderClient.ordersCount || 0;
        const spent = orderClient.totalSpent || 0;

        clientList.push({
          _id: `guest_${phone || email}`,
          name: orderClient.customerName || 'Client Vicky-Shop',
          email: orderClient.customerEmail || 'Non renseigné',
          phone: orderClient.customerPhone || '',
          city: orderClient.city || 'Abidjan',
          address: orderClient.deliveryAddress || '',
          role: 'client',
          isRegistered: false,
          ordersCount: count,
          orderCount: count,
          totalSpent: spent,
          createdAt: orderClient.lastOrderDate || new Date(),
        });

        if (phone) matchedPhones.add(phone);
        if (email) matchedEmails.add(email);
      }
    });

    // 5. Recherche par mot-clé (nom, email, téléphone ou ville)
    let filteredClients = clientList;
    if (cleanSearch) {
      filteredClients = clientList.filter((c) => {
        const matchName = c.name && c.name.toLowerCase().includes(cleanSearch);
        const matchEmail = c.email && c.email.toLowerCase().includes(cleanSearch);
        const matchPhone = c.phone && c.phone.toLowerCase().includes(cleanSearch);
        const matchCity = c.city && c.city.toLowerCase().includes(cleanSearch);
        return matchName || matchEmail || matchPhone || matchCity;
      });
    }

    // 6. Tri par nombre de commandes puis par date récente
    filteredClients.sort((a, b) => {
      if (b.ordersCount !== a.ordersCount) return b.ordersCount - a.ordersCount;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    res.status(200).json({
      status: 'success',
      results: filteredClients.length,
      data: { users: filteredClients },
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
