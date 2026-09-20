import jwt from 'jsonwebtoken';
import { config } from '../config/environment.js';
import { User } from '../models/User.js';

/**
 * Middleware de protection des routes nécessitant une authentification JWT.
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

    // Vérification de la validité du jeton
    const decoded = jwt.verify(token, config.jwt.secret);

    // Vérification de l'existence de l'utilisateur
    const currentUser = await User.findById(decoded.id);
    if (!currentUser) {
      return res.status(401).json({
        status: 'error',
        message: 'L\'utilisateur associé à ce jeton n\'existe plus.',
      });
    }

    // Transmission de l'utilisateur a la requete
    req.user = currentUser;
    next();
  } catch (error) {
    return res.status(401).json({
      status: 'error',
      message: 'Jeton d\'authentification invalide ou expire.',
    });
  }
};

/**
 * Middleware strict reservant l'acces aux utilisateurs ayant le role admin.
 */
export const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({
      status: 'error',
      message: 'Acces refuse. Vous devez disposer des privileges administrateur pour cette ressource.',
    });
  }
  next();
};

