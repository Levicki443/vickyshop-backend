import jwt from 'jsonwebtoken';
import { config } from '../config/environment.js';
import { User } from '../models/User.js';
import { Product } from '../models/Product.js';
import { ROLES, normalizeRole, isSellerRole, isAdminRole } from '../utils/roleUtils.js';
import { securityLog } from '../utils/securityLogger.js';

/**
 * Middleware de protection des routes nécessitant une authentification JWT.
 * Récupère systématiquement l'utilisateur depuis la base de données (Zero Trust Client).
 */
export const protect = async (req, res, next) => {
  try {
    let token;
    const clientIp = req.ip || req.connection.remoteAddress;

    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith('Bearer')
    ) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        status: 'error',
        message: 'Vous devez être connecté pour accéder à cette ressource.',
      });
    }

    // Vérification cryptographique du jeton
    const decoded = jwt.verify(token, config.jwt.secret);

    // Récupération de l'utilisateur avec vérification d'état
    const currentUser = await User.findById(decoded.id).select('+lockUntil');
    if (!currentUser) {
      securityLog.accessDenied({
        userId: decoded.id,
        role: 'Inconnu',
        route: req.originalUrl,
        method: req.method,
        ip: clientIp,
        reason: 'Utilisateur associé au jeton supprimé',
      });
      return res.status(401).json({
        status: 'error',
        message: 'L\'utilisateur associé à ce jeton n\'existe plus.',
      });
    }

    // Si le compte est temporairement verrouillé
    if (currentUser.isLocked && currentUser.isLocked()) {
      return res.status(423).json({
        status: 'error',
        message: 'Votre compte est temporairement verrouillé pour des raisons de sécurité.',
      });
    }

    // Si c'est un compte vendeur suspendu
    if (isSellerRole(currentUser.role) && currentUser.isSellerActive === false) {
      return res.status(403).json({
        status: 'error',
        message: 'Votre compte vendeur a été temporairement suspendu. Veuillez contacter l\'administration.',
      });
    }

    req.user = currentUser;
    next();
  } catch (error) {
    return res.status(401).json({
      status: 'error',
      message: 'Jeton d\'authentification invalide ou expiré.',
    });
  }
};

/**
 * Middleware générique pour restreindre l'accès à une liste de rôles autorisés.
 */
export const requireRole = (...roles) => {
  const allowed = roles.map((r) => normalizeRole(r));
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        status: 'error',
        message: 'Vous devez être authentifié pour effectuer cette action.',
      });
    }

    const currentRole = normalizeRole(req.user.role);
    if (!allowed.includes(currentRole)) {
      securityLog.accessDenied({
        userId: req.user._id,
        role: currentRole,
        route: req.originalUrl,
        method: req.method,
        ip: req.ip,
        reason: `Rôle requis : [${allowed.join(', ')}] mais utilisateur a [${currentRole}]`,
      });
      return res.status(403).json({
        status: 'error',
        message: 'Accès refusé. Vous ne disposez pas des autorisations nécessaires.',
      });
    }
    next();
  };
};

/**
 * Middleware réservant l'accès aux vendeurs et aux administrateurs.
 */
export const requireSeller = (req, res, next) => {
  if (!req.user || (!isSellerRole(req.user.role) && !isAdminRole(req.user.role))) {
    securityLog.accessDenied({
      userId: req.user?._id,
      role: req.user?.role,
      route: req.originalUrl,
      method: req.method,
      ip: req.ip,
      reason: 'Espace réservé aux vendeurs',
    });
    return res.status(403).json({
      status: 'error',
      message: 'Accès refusé. Cet espace est exclusivement réservé aux vendeurs enregistrés.',
    });
  }
  next();
};

/**
 * Middleware strict réservant l'accès aux administrateurs.
 */
export const requireAdmin = (req, res, next) => {
  if (!req.user || !isAdminRole(req.user.role)) {
    securityLog.accessDenied({
      userId: req.user?._id,
      role: req.user?.role,
      route: req.originalUrl,
      method: req.method,
      ip: req.ip,
      reason: 'Privilèges administrateur requis',
    });
    return res.status(403).json({
      status: 'error',
      message: 'Accès refusé. Vous devez disposer des privilèges administrateur pour cette ressource.',
    });
  }
  next();
};

/**
 * Middleware vérifiant que le produit manipulé appartient bien au vendeur connecté (ou qu'il est admin).
 * Prévient formellement les vulnérabilités de type IDOR / BOLA.
 */
export const checkProductOwnership = async (req, res, next) => {
  try {
    const { id } = req.params;
    const product = await Product.findById(id);

    if (!product) {
      return res.status(404).json({
        status: 'error',
        message: 'Produit introuvable.',
      });
    }

    // Si l'utilisateur est admin, accès complet accordé
    if (isAdminRole(req.user.role)) {
      req.product = product;
      return next();
    }

    // Si c'est un vendeur, vérification stricte de la propriété
    if (
      !product.seller ||
      product.seller.toString() !== req.user._id.toString()
    ) {
      securityLog.accessDenied({
        userId: req.user._id,
        role: req.user.role,
        route: req.originalUrl,
        method: req.method,
        ip: req.ip,
        reason: `IDOR intercepté : tentative de modification du produit ${id} d'un autre vendeur`,
      });
      return res.status(403).json({
        status: 'error',
        message: 'Action interdite. Vous n\'êtes pas le propriétaire de ce produit.',
      });
    }

    req.product = product;
    next();
  } catch (error) {
    next(error);
  }
};
