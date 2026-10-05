import crypto from 'crypto';

/**
 * Utilitaires cryptographiques pour la génération de jetons aléatoires,
 * codes de vérification à usage unique et noms de fichiers sécurisés.
 */

/**
 * Génère un jeton cryptographiquement sécurisé au format hexadécimal.
 * @param {number} bytes 
 * @returns {string}
 */
export const generateRandomToken = (bytes = 32) => {
  return crypto.randomBytes(bytes).toString('hex');
};

/**
 * Hache un jeton avec SHA-256 pour stockage sécurisé en base de données.
 * Empêche toute réutilisation de jetons de réinitialisation en cas de fuite de la BDD.
 * @param {string} token 
 * @returns {string}
 */
export const hashToken = (token) => {
  if (!token || typeof token !== 'string') return '';
  return crypto.createHash('sha256').update(token).digest('hex');
};

/**
 * Génère un code numérique à usage unique (OTP) pour vérification par email / 2FA.
 * @param {number} length 
 * @returns {string}
 */
export const generateNumericOTP = (length = 6) => {
  const min = Math.pow(10, length - 1);
  const max = Math.pow(10, length) - 1;
  return crypto.randomInt(min, max + 1).toString();
};

/**
 * Génère un nom de fichier aléatoire et sécurisé avec l'extension nettoyée.
 * Protège contre les attaques de type Path Traversal et l'écrasement de fichiers.
 * @param {string} originalName 
 * @returns {string}
 */
export const generateSecureFileName = (originalName = '') => {
  const randomHex = crypto.randomBytes(16).toString('hex');
  const timestamp = Date.now();
  
  // Extraction et assainissement de l'extension
  const rawExt = originalName.split('.').pop() || '';
  const sanitizedExt = rawExt.toLowerCase().replace(/[^a-z0-9]/g, '');
  const finalExt = ['jpg', 'jpeg', 'png', 'webp', 'avif'].includes(sanitizedExt)
    ? sanitizedExt
    : 'jpg';

  return `vk_${timestamp}_${randomHex}.${finalExt}`;
};
