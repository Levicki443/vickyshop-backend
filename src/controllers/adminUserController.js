import {
  calculateUserKPIs,
  getPaginatedUsers,
  getDetailedUserProfile,
  updateAuthorizedUserFields,
  changeUserStatus,
} from '../services/adminUserService.js';
import { User } from '../models/User.js';
import { Order } from '../models/Order.js';
import { Product } from '../models/Product.js';
import { notifyAdmins, notifyUser } from '../config/socket.js';
import { securityLog } from '../utils/securityLogger.js';

/**
 * Contrôleur REST pour l'administration complète des utilisateurs Vicky-Shop.
 * Gère les statistiques temps réel, pagination, fiches détaillées et actions de modération.
 */

// GET /api/admin/users/stats
export const getUserStats = async (req, res, next) => {
  try {
    const stats = await calculateUserKPIs();
    res.status(200).json({
      status: 'success',
      data: { stats },
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/admin/users
export const getUsers = async (req, res, next) => {
  try {
    const result = await getPaginatedUsers(req.query);
    res.status(200).json({
      status: 'success',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/admin/users/:id
export const getUserById = async (req, res, next) => {
  try {
    const profile = await getDetailedUserProfile(req.params.id);
    res.status(200).json({
      status: 'success',
      data: profile,
    });
  } catch (error) {
    next(error);
  }
};

// PUT /api/admin/users/:id
export const updateUser = async (req, res, next) => {
  try {
    const clientIp = req.ip || req.connection.remoteAddress;
    const updatedUser = await updateAuthorizedUserFields(
      req.params.id,
      req.body,
      req.user,
      clientIp
    );

    const safeUser = {
      _id: updatedUser._id,
      name: updatedUser.name,
      email: updatedUser.email,
      phone: updatedUser.phone,
      role: updatedUser.role,
      status: updatedUser.status,
      city: updatedUser.city,
      address: updatedUser.address,
      isEmailVerified: updatedUser.isEmailVerified,
      isPhoneVerified: updatedUser.isPhoneVerified,
      adminNotes: updatedUser.adminNotes,
    };

    try {
      notifyAdmins('user:updated', safeUser);
      notifyUser(updatedUser._id.toString(), 'user:profile_updated', safeUser);
    } catch {
      // Ignorer sans bloquer
    }

    res.status(200).json({
      status: 'success',
      message: 'Utilisateur mis à jour avec succès.',
      data: { user: safeUser },
    });
  } catch (error) {
    next(error);
  }
};

// PATCH /api/admin/users/:id/status
export const updateUserStatus = async (req, res, next) => {
  try {
    const { status, reason } = req.body;
    const clientIp = req.ip || req.connection.remoteAddress;

    const updatedUser = await changeUserStatus(
      req.params.id,
      { status, reason },
      req.user,
      clientIp
    );

    const safeUser = {
      _id: updatedUser._id,
      name: updatedUser.name,
      email: updatedUser.email,
      status: updatedUser.status,
      suspensionReason: updatedUser.suspensionReason,
    };

    try {
      notifyAdmins('user:status_changed', safeUser);
      notifyUser(updatedUser._id.toString(), 'user:status_changed', safeUser);
    } catch {
      // Ignorer sans bloquer
    }

    res.status(200).json({
      status: 'success',
      message: `Statut du compte mis à jour : ${status}.`,
      data: { user: safeUser },
    });
  } catch (error) {
    next(error);
  }
};

// DELETE /api/admin/users/:id
export const deleteUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const clientIp = req.ip || req.connection.remoteAddress;

    if (req.user._id.toString() === id.toString()) {
      return res.status(403).json({
        status: 'error',
        message: 'Action refusée : Vous ne pouvez pas supprimer votre propre compte administrateur.',
      });
    }

    const targetUser = await User.findById(id);
    if (!targetUser) {
      return res.status(404).json({
        status: 'error',
        message: 'Utilisateur introuvable.',
      });
    }

    if (targetUser.role === 'admin') {
      const remainingAdmins = await User.countDocuments({
        role: 'admin',
        status: 'actif',
        _id: { $ne: targetUser._id },
      });
      if (remainingAdmins === 0) {
        return res.status(403).json({
          status: 'error',
          message: 'Action refusée : Impossible de supprimer le dernier administrateur actif.',
        });
      }
    }

    // Vérification de conservation des données et intégrité référentielle
    const [hasOrders, hasProducts] = await Promise.all([
      Order.exists({
        $or: [
          { customerId: targetUser._id },
          { customerPhone: targetUser.phone },
          { customerEmail: targetUser.email },
          { 'items.sellerId': targetUser._id },
        ],
      }),
      Product.exists({ seller: targetUser._id }),
    ]);

    // Si des commandes ou produits existent, désactivation logique obligatoire
    if (hasOrders || hasProducts) {
      targetUser.status = 'desactive';
      targetUser.suspensionReason = 'Compte désactivé pour conservation des archives commerciales.';
      targetUser.adminAuditLog.push({
        action: 'SUPPRESSION_LOGIQUE',
        performedBy: req.user._id,
        performedByName: req.user.name || 'Administrateur',
        date: new Date(),
        reason: 'Archivage et désactivation logique (commandes ou catalogue existants)',
      });
      await targetUser.save();

      securityLog.adminAction({
        action: 'SUPPRESSION_LOGIQUE_UTILISATEUR',
        targetResource: 'User',
        userId: req.user._id,
        details: { targetUserId: id, reason: 'Archives conservées' },
        ip: clientIp,
      });

      try {
        notifyAdmins('user:status_changed', { _id: targetUser._id, status: 'desactive' });
      } catch {}

      return res.status(200).json({
        status: 'success',
        message: 'Compte désactivé avec succès. Les historiques de commandes ont été préservés.',
        data: { action: 'desactive', user: targetUser },
      });
    }

    // Suppression physique uniquement si aucun lien commercial n'existe
    await User.findByIdAndDelete(id);

    securityLog.adminAction({
      action: 'SUPPRESSION_PHYSIQUE_UTILISATEUR',
      targetResource: 'User',
      userId: req.user._id,
      details: { targetUserId: id },
      ip: clientIp,
    });

    try {
      notifyAdmins('user:deleted', { _id: id });
    } catch {}

    res.status(200).json({
      status: 'success',
      message: 'Compte utilisateur définitivement supprimé.',
      data: { action: 'supprime', id },
    });
  } catch (error) {
    next(error);
  }
};
