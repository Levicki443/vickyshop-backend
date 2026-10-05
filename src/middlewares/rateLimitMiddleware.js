import rateLimit from 'express-rate-limit';

/**
 * Limiteur de requêtes spécifique aux tentatives de connexion et d'inscription.
 * Prévient les attaques par force brute et credential stuffing.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15, // 15 tentatives max par IP par fenêtre
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    code: 429,
    message: 'Trop de tentatives d\'authentification depuis cette adresse IP. Veuillez patienter 15 minutes avant de réessayer.',
  },
});

/**
 * Limiteur strict pour l'inscription Administrateur avec clé secrète.
 */
export const adminRegisterLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 heure
  max: 5, // 5 tentatives max par heure
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    code: 429,
    message: 'Trop de tentatives de création de compte administrateur. Accès temporairement bloqué.',
  },
});

/**
 * Limiteur pour la réinitialisation de mot de passe.
 */
export const passwordResetLimiter = rateLimit({
  windowMs: 30 * 60 * 1000, // 30 minutes
  max: 5, // 5 demandes max par IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    code: 429,
    message: 'Trop de demandes de réinitialisation de mot de passe. Veuillez réessayer plus tard.',
  },
});

/**
 * Limiteur de création de commande pour éviter le spam et les commandes frauduleuses.
 */
export const orderLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 20, // 20 commandes max par 10 minutes
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    code: 429,
    message: 'Limite de passage de commandes atteinte. Veuillez patienter quelques instants.',
  },
});
