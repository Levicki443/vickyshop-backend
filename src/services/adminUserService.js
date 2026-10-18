import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { ROLES, normalizeRole } from '../utils/roleUtils.js';
import { securityLog } from '../utils/securityLogger.js';
import {
  aggregateOrdersSummary,
  aggregateProductsSummary,
  fetchClientCommercialDetails,
  fetchSellerCommercialDetails,
} from './adminUserAggregations.js';

/**
 * Service Métier pour la gestion complète et sécurisée des utilisateurs dans le BackOffice.
 * Implémente le calcul des KPIs réels, pagination, agrégation de commandes et règles d'audit.
 */

// 1. Calcul des statistiques en temps réel depuis la base de données
export const calculateUserKPIs = async () => {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    totalUsers,
    totalClients,
    totalSellers,
    totalAdmins,
    activeUsers,
    suspendedUsers,
    newUsersToday,
    newUsersLast30Days,
  ] = await Promise.all([
    User.countDocuments({}),
    User.countDocuments({ role: ROLES.CLIENT }),
    User.countDocuments({ role: { $in: ['vendeur', 'seller'] } }),
    User.countDocuments({ role: ROLES.ADMIN }),
    User.countDocuments({ status: 'actif' }),
    User.countDocuments({ status: { $in: ['suspendu', 'desactive'] } }),
    User.countDocuments({ createdAt: { $gte: startOfDay } }),
    User.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
  ]);

  return {
    totalUsers,
    totalClients,
    totalSellers,
    totalAdmins,
    activeUsers,
    suspendedUsers,
    newUsersToday,
    newUsersLast30Days,
    updatedAt: new Date(),
  };
};

// 2. Récupération paginée et filtrée des utilisateurs réels
export const getPaginatedUsers = async (params = {}) => {
  const page = Math.max(1, parseInt(params.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(params.limit, 10) || 10));
  const skip = (page - 1) * limit;

  const filter = {};

  // Recherche par mot-clé (Nom, Email, Téléphone ou Identifiant ObjectId)
  if (params.search && typeof params.search === 'string' && params.search.trim()) {
    const term = params.search.trim();
    const orClauses = [
      { name: { $regex: term, $options: 'i' } },
      { email: { $regex: term, $options: 'i' } },
      { phone: { $regex: term, $options: 'i' } },
    ];
    if (mongoose.Types.ObjectId.isValid(term)) {
      orClauses.push({ _id: new mongoose.Types.ObjectId(term) });
    }
    filter.$or = orClauses;
  }

  // Filtre par rôle
  if (params.role && params.role !== 'all') {
    if (params.role === 'vendeur' || params.role === 'seller') {
      filter.role = { $in: ['vendeur', 'seller'] };
    } else {
      filter.role = params.role;
    }
  }

  // Filtre par statut
  if (params.status && params.status !== 'all') {
    filter.status = params.status;
  }

  // Filtre par vérification
  if (params.verified === 'verified') {
    filter.$or = [{ isEmailVerified: true }, { isPhoneVerified: true }];
  } else if (params.verified === 'unverified') {
    filter.isEmailVerified = { $ne: true };
    filter.isPhoneVerified = { $ne: true };
  }

  // Tri sécurisé
  const allowedSortFields = ['createdAt', 'name', 'lastLogin', 'email', 'role', 'status'];
  const sortBy = allowedSortFields.includes(params.sortBy) ? params.sortBy : 'createdAt';
  const sortDirection = params.sortOrder === 'asc' ? 1 : -1;

  const [total, users] = await Promise.all([
    User.countDocuments(filter),
    User.find(filter)
      .select('-password -passwordResetToken -passwordResetExpires -twoFactorCode')
      .sort({ [sortBy]: sortDirection })
      .skip(skip)
      .limit(limit)
      .lean(),
  ]);

  const userIds = users.map((u) => u._id);
  const [ordersSummary, productsSummary] = await Promise.all([
    aggregateOrdersSummary(userIds),
    aggregateProductsSummary(userIds),
  ]);

  const ordersMap = new Map(ordersSummary.map((o) => [o._id.toString(), o]));
  const productsMap = new Map(productsSummary.map((p) => [p._id.toString(), p]));

  const enrichedUsers = users.map((u) => {
    const uid = u._id.toString();
    const orderData = ordersMap.get(uid);
    const productData = productsMap.get(uid);

    return {
      ...u,
      role: normalizeRole(u.role),
      status: u.status || 'actif',
      ordersCount: orderData ? orderData.ordersCount : 0,
      totalSpent: orderData ? orderData.totalSpent : 0,
      productsCount: productData ? productData.productsCount : 0,
    };
  });

  return {
    users: enrichedUsers,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
};

// 3. Fiche détaillée d'un utilisateur avec ses données commerciales et d'audit
export const getDetailedUserProfile = async (userId) => {
  const user = await User.findById(userId)
    .select('-password -passwordResetToken -passwordResetExpires -twoFactorCode')
    .lean();

  if (!user) {
    const error = new Error('Utilisateur introuvable dans la base de données.');
    error.statusCode = 404;
    throw error;
  }

  const clientInfo = await fetchClientCommercialDetails(user);

  let sellerInfo = null;
  if (user.role === 'vendeur' || user.role === 'seller') {
    sellerInfo = await fetchSellerCommercialDetails(user);
  }

  return {
    user: {
      ...user,
      role: normalizeRole(user.role),
      status: user.status || 'actif',
    },
    commercialInfo: {
      ...clientInfo,
      sellerInfo,
    },
  };
};

// 4. Mise à jour contrôlée des champs autorisés avec protections critiques
export const updateAuthorizedUserFields = async (userId, payload, adminUser, clientIp) => {
  const user = await User.findById(userId);
  if (!user) {
    const error = new Error('Utilisateur introuvable.');
    error.statusCode = 404;
    throw error;
  }

  const allowedFields = [
    'name', 'phone', 'city', 'address', 'role',
    'isEmailVerified', 'isPhoneVerified', 'adminNotes',
    'shopName', 'shopDescription',
  ];

  const updates = {};
  for (const field of allowedFields) {
    if (payload[field] !== undefined) {
      updates[field] = payload[field];
    }
  }

  // Protection sécurité : impossible pour un administrateur de modifier son propre rôle
  if (updates.role && updates.role !== user.role) {
    if (adminUser._id.toString() === userId.toString()) {
      const error = new Error('Action refusée : Vous ne pouvez pas modifier votre propre rôle administrateur.');
      error.statusCode = 403;
      throw error;
    }

    // Protection sécurité : protection du dernier administrateur actif
    if (user.role === ROLES.ADMIN && updates.role !== ROLES.ADMIN) {
      const activeAdminsCount = await User.countDocuments({
        role: ROLES.ADMIN,
        status: 'actif',
        _id: { $ne: user._id },
      });
      if (activeAdminsCount === 0) {
        const error = new Error('Action refusée : Impossible de rétrograder le dernier administrateur actif de la plateforme.');
        error.statusCode = 403;
        throw error;
      }
    }
    updates.role = normalizeRole(updates.role);
  }

  user.adminAuditLog.push({
    action: 'MODIFICATION_CHAMPS',
    performedBy: adminUser._id,
    performedByName: adminUser.name || 'Administrateur',
    date: new Date(),
    reason: payload.reason || 'Mise à jour administrative',
    details: updates,
  });

  Object.assign(user, updates);
  await user.save();

  securityLog.adminAction({
    action: 'MODIFICATION_UTILISATEUR',
    targetResource: 'User',
    userId: adminUser._id,
    details: { targetUserId: user._id, updates },
    ip: clientIp,
  });

  return user;
};

// 5. Modification du statut de compte (Suspension / Réactivation / Désactivation)
export const changeUserStatus = async (userId, { status, reason }, adminUser, clientIp) => {
  const validStatuses = ['actif', 'suspendu', 'desactive'];
  if (!validStatuses.includes(status)) {
    const error = new Error(`Statut invalide : ${status}. Choix possibles : ${validStatuses.join(', ')}.`);
    error.statusCode = 400;
    throw error;
  }

  if (adminUser._id.toString() === userId.toString()) {
    const error = new Error('Action refusée : Vous ne pouvez pas suspendre ou désactiver votre propre compte.');
    error.statusCode = 403;
    throw error;
  }

  const user = await User.findById(userId);
  if (!user) {
    const error = new Error('Utilisateur introuvable.');
    error.statusCode = 404;
    throw error;
  }

  if (user.role === ROLES.ADMIN && status !== 'actif') {
    const otherAdmins = await User.countDocuments({
      role: ROLES.ADMIN,
      status: 'actif',
      _id: { $ne: user._id },
    });
    if (otherAdmins === 0) {
      const error = new Error('Action refusée : Impossible de suspendre ou désactiver le dernier administrateur de la plateforme.');
      error.statusCode = 403;
      throw error;
    }
  }

  user.status = status;
  user.suspensionReason = status !== 'actif' ? (reason || 'Non précisé').trim() : '';

  user.adminAuditLog.push({
    action: `STATUT_${status.toUpperCase()}`,
    performedBy: adminUser._id,
    performedByName: adminUser.name || 'Administrateur',
    date: new Date(),
    reason: reason || 'Mise à jour du statut',
    details: { newStatus: status },
  });

  await user.save();

  securityLog.adminAction({
    action: `STATUT_UTILISATEUR_${status.toUpperCase()}`,
    targetResource: 'User',
    userId: adminUser._id,
    details: { targetUserId: user._id, status, reason },
    ip: clientIp,
  });

  return user;
};
