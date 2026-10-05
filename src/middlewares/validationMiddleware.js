import mongoose from 'mongoose';

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
  } else if (customerName.trim().length > 100) {
    errors.push('Le nom du client ne peut pas dépasser 100 caractères.');
  }

  // Validation Numéro de téléphone (au moins 10 chiffres)
  const phoneDigits = typeof customerPhone === 'string' ? customerPhone.replace(/[^\d+]/g, '') : '';
  const pureDigits = phoneDigits.replace(/\D/g, '');
  if (!customerPhone || typeof customerPhone !== 'string' || pureDigits.length < 10) {
    errors.push('Un numéro de téléphone valide est obligatoire (au moins 10 chiffres).');
  }

  // Validation Adresse de livraison
  if (!deliveryAddress || typeof deliveryAddress !== 'string' || deliveryAddress.trim().length < 3) {
    errors.push('L\'adresse de livraison est obligatoire (au moins 3 caractères).');
  } else if (deliveryAddress.trim().length > 255) {
    errors.push('L\'adresse de livraison ne peut pas dépasser 255 caractères.');
  }

  // Validation Panier
  if (!items || !Array.isArray(items) || items.length === 0) {
    errors.push('La commande doit contenir au moins un article.');
  } else {
    items.forEach((item, index) => {
      if (!item || typeof item !== 'object') {
        errors.push(`L'article à l'index ${index} est invalide.`);
        return;
      }
      if (!item.productId || !mongoose.Types.ObjectId.isValid(item.productId)) {
        errors.push(`L'identifiant produit de l'article à l'index ${index} est manquant ou invalide.`);
      }
      const qty = Number(item.quantity);
      if (!item.quantity || isNaN(qty) || qty < 1 || !Number.isInteger(qty)) {
        errors.push(`La quantité pour l'article ${item.title || index} doit être un entier positif (minimum 1).`);
      }
    });
  }

  // Validation Moyen de paiement
  const validPaymentMethods = ['livraison', 'CASH_ON_DELIVERY', 'cash'];
  if (paymentMethod && !validPaymentMethods.includes(paymentMethod)) {
    errors.push(`Moyen de paiement non supporté. Le paiement s'effectue exclusivement en espèces à la livraison.`);
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
 * Valide les informations lors de la création d'un produit.
 */
export const validateProductPayload = (req, res, next) => {
  const { title, price, category, stockQuantity } = req.body;
  const errors = [];

  if (!title || typeof title !== 'string' || title.trim().length < 2) {
    errors.push('Le titre du produit est obligatoire (au moins 2 caractères).');
  }
  if (price === undefined || isNaN(Number(price)) || Number(price) < 0) {
    errors.push('Le prix du produit doit être un nombre positif ou nul.');
  }
  if (!category || typeof category !== 'string' || category.trim().length < 2) {
    errors.push('La catégorie est obligatoire.');
  }
  if (stockQuantity !== undefined && (isNaN(Number(stockQuantity)) || Number(stockQuantity) < 0)) {
    errors.push('La quantité en stock ne peut pas être négative.');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      status: 'error',
      message: 'Erreurs de validation du produit.',
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
    req.query.search = req.query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').trim();
  }
  next();
};
