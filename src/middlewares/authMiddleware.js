import jwt from 'jsonwebtoken';
import { config } from '../config/environment.js';
import { User } from '../models/User.js';
import { Product } from '../models/Product.js';
import { ROLES, normalizeRole, isSellerRole, isAdminRole } from '../utils/roleUtils.js';

/**
 * Middleware de protection des routes nécessitant une authentification JWT.
 * Récupère systématiquement l'utilisateur depuis la base de données (Zero Trust Client).
 */
export const protect = async (req, res, next) => {
  try {
    let token;

    // Récupération du jeton dans l'en-tête Authorization
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

    // Vérification de la validité cryptographique du jeton
    const decoded = jwt.verify(token, config.jwt.secret);

    // Vérification de l'existence de l'utilisateur en base de données
    const currentUser = await User.findById(decoded.id);
    if (!currentUser) {
      return res.status(401).json({
        status: 'error',
        message: 'L\'utilisateur associé à ce jeton n\'existe plus.',
      });
    }

    // Si c'est un compte vendeur désactivé ou suspendu, refuser l'accès
    if (isSellerRole(currentUser.role) && currentUser.isSellerActive === false) {
      return res.status(403).json({
        status: 'error',
        message: 'Votre compte vendeur a été temporairement suspendu. Veuillez contacter l\'administration.',
      });
    }

    // Transmission de l'utilisateur authentifié garanti à la requête
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
 * Gère la normalisation robuste des rôles passés et du rôle utilisateur.
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
    return res.status(403).json({
      status: 'error',
      message: 'Accès refusé. Vous devez disposer des privilèges administrateur pour cette ressource.',
    });
  }
  next();
};

/**
 * Middleware vérifiant que le produit manipulé appartient bien au vendeur connecté (ou qu'il est admin).
 * Garantit l'isolation stricte multi-vendeur et prévient les failles de type IDOR.
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
