/**
 * Middlewares de validation et de sécurisation des données entrantes.
 * Conforme aux exigences d'audit de sécurité (whitelisting, typage strict, assainissement).
 */

/**
 * Valide les champs obligatoires lors de la création d'une commande.
 */
export const validateOrderPayload = (req, res, next) => {
  const {
    customerName,
    customerPhone,
    deliveryAddress,
    items,
    paymentMethod,
  } = req.body;

  const errors = [];

  // Validation Nom Client
  if (!customerName || typeof customerName !== 'string' || customerName.trim().length < 2) {
    errors.push('Le nom du client doit comporter au moins 2 caractères.');
  }

  // Validation Numéro de téléphone (Format international ou local)
  if (!customerPhone || typeof customerPhone !== 'string' || customerPhone.trim().length < 8) {
    errors.push('Un numéro de téléphone valide est obligatoire (min 8 chiffres).');
  }

  // Validation Adresse
  if (!deliveryAddress || typeof deliveryAddress !== 'string' || deliveryAddress.trim().length < 3) {
    errors.push('L\'adresse de livraison est obligatoire (min 3 caractères).');
  }

  // Validation Panier
  if (!items || !Array.isArray(items) || items.length === 0) {
    errors.push('La commande doit contenir au moins un article.');
  } else {
    items.forEach((item, index) => {
      if (!item.title || typeof item.price !== 'number' || item.price < 0) {
        errors.push(`L'article à l'index ${index} est invalide (titre ou prix manquant).`);
      }
      if (!item.quantity || typeof item.quantity !== 'number' || item.quantity < 1) {
        errors.push(`La quantité pour l'article ${item.title || index} doit être au moins 1.`);
      }
    });
  }

  // Validation Moyen de paiement
  const validPaymentMethods = ['wave', 'orange-money', 'mtn-momo', 'carte', 'livraison'];
  if (!paymentMethod || !validPaymentMethods.includes(paymentMethod)) {
    errors.push(`Moyen de paiement invalide. Choix acceptés : ${validPaymentMethods.join(', ')}.`);
  }

  if (errors.length > 0) {
    return res.status(400).json({
      status: 'error',
      message: 'Erreurs de validation du formulaire de commande.',
      errors,
    });
  }

  next();
};

/**
 * Assainit les paramètres de recherche pour éviter les injections RegExp NoSQL.
 */
export const sanitizeSearchParams = (req, res, next) => {
  if (req.query.search && typeof req.query.search === 'string') {
    // Échappe les caractères spéciaux de RegExp
    req.query.search = req.query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').trim();
  }
  next();
};
