import mongoose from 'mongoose';
import { Product } from '../models/Product.js';
import { Order } from '../models/Order.js';

/**
 * Service modulaire de résolution contextuelle des données réelles de Vicky-Shop.
 * Interroge MongoDB en lecture seule avec isolation stricte des droits (RBAC).
 */

const ORDER_REGEX = /\b(CMD-[A-Z0-9]+)\b/i;
const PRODUCT_KEYWORDS = [
  'produit', 'article', 'robe', 'chaussure', 'pantalon', 'chemise', 'sac',
  'montre', 't-shirt', 'veste', 'prix', 'combien', 'stock', 'disponible',
  'acheter', 'catalogue', 'casque', 'téléphone', 'parfum', 'bijou'
];

/**
 * Extrait les données réelles et personnalisées pertinentes pour enrichir le prompt de l'IA.
 *
 * @param {Object} params
 * @param {string} params.message - Message formulé par l'utilisateur
 * @param {Object|null} params.user - Profil de l'utilisateur authentifié (req.user)
 * @returns {Promise<Object>} Contexte textuel et entités vérifiées
 */
export const resolveDynamicContext = async ({ message, user = null }) => {
  const emptyResult = {
    rawText: '',
    products: [],
    orders: [],
    isSellerAction: false,
    toString() { return this.rawText; },
  };

  if (mongoose.connection.readyState !== 1) {
    return emptyResult;
  }

  const raw = message || '';
  const lower = raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const contextParts = [];
  let userOrders = [];
  let matchedProducts = [];

  // Détection d'intention d'ajout de produit ou gestion vendeur
  const isSellerAction =
    /\b(ajouter|creer|publier|mettre en vente|enregistrer|inserer)\b/.test(lower) &&
    /\b(produit|article|robe|chaussure|item|photo)\b/.test(lower);

  // Détection d'intention explicite de guide d'achat / passer commande
  const isOrderingGuide =
    /\b(comment|passer|faire|effectuer|enregistrer|valider)\b/.test(lower) &&
    /\b(commande|commander|achat|acheter)\b/.test(lower);

  try {
    // 1. Détection et extraction des commandes personnelles (si tracking ou code spécifique)
    const isOrderTracking =
      !isOrderingGuide &&
      (ORDER_REGEX.test(raw) ||
        /\b(suivi|suivre|statut|colis|ou en est|ou est)\b/.test(lower) ||
        (lower.includes('commande') && user && user._id));

    if (isOrderTracking && user && user._id) {
      const orderMatch = raw.match(ORDER_REGEX);

      if (orderMatch) {
        const specificOrder = await Order.findOne({
          customerId: user._id,
          orderNumber: orderMatch[1].toUpperCase(),
        }).select('orderNumber status totalAmount items createdAt deliveryAddress city').lean();

        if (specificOrder) userOrders = [specificOrder];
      }

      if (userOrders.length === 0) {
        userOrders = await Order.find({ customerId: user._id })
          .sort({ createdAt: -1 })
          .limit(3)
          .select('orderNumber status totalAmount items createdAt deliveryAddress city')
          .lean();
      }

      if (userOrders.length > 0) {
        contextParts.push(`DONNÉES COMMANDES CLIENT (${user.name || 'Connecté'}) :\n` +
          userOrders.map((ord) => `- Commande N° ${ord.orderNumber} : Statut = "${ord.status}", Montant = ${ord.totalAmount?.toLocaleString('fr-FR')} FCFA, Destination = ${ord.city} (${ord.deliveryAddress}). [ACTION:TRACK_ORDER:${ord.orderNumber}]`).join('\n')
        );
      }
    }

    // 2. Détection de recherche produit réelle (exclut les actions vendeurs d'ajout)
    const containsProductKeyword = PRODUCT_KEYWORDS.some((kw) => lower.includes(kw));
    if (containsProductKeyword && !isSellerAction && !isOrderingGuide) {
      const cleanKeywords = lower
        .replace(/[^\w\s-]/gi, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 3 && !['quel', 'quels', 'quelle', 'quelles', 'sont', 'votre', 'vos', 'avez', 'combien', 'avoir', 'avec', 'pour'].includes(w));

      if (cleanKeywords.length > 0) {
        const queryRegex = new RegExp(cleanKeywords.join('|'), 'i');
        matchedProducts = await Product.find({
          inStock: true,
          $or: [{ title: queryRegex }, { category: queryRegex }, { description: queryRegex }],
        })
          .select('title price category stockQuantity slug _id')
          .limit(4)
          .lean();
      }

      if (matchedProducts.length === 0 && (lower.includes('stock') || lower.includes('catalogue') || lower.includes('produit'))) {
        matchedProducts = await Product.find({ inStock: true })
          .sort({ createdAt: -1 })
          .limit(4)
          .select('title price category stockQuantity slug _id')
          .lean();
      }

      if (matchedProducts.length > 0) {
        contextParts.push(`ARTICLES EN STOCK DANS VICKY-SHOP :\n` +
          matchedProducts.map((p) => `- "${p.title}" | Catégorie : ${p.category} | Prix : ${p.price?.toLocaleString('fr-FR')} FCFA | Stock : ${p.stockQuantity} [ACTION:VIEW_PRODUCT:${p.slug || p._id}]`).join('\n')
        );
      }
    }

    // 3. Contexte Vendeur connecté
    if (user && (user.role === 'vendeur' || user.role === 'admin')) {
      const sellerProductsCount = await Product.countDocuments({ seller: user._id });
      contextParts.push(`ESPACE VENDEUR (${user.name}) : ${sellerProductsCount} article(s) publié(s) en boutique. [ACTION:SELLER_DASHBOARD]`);
    }
  } catch (err) {
    console.warn('[aiContextResolver] Erreur non bloquante de résolution de contexte :', err.message);
  }

  const rawText = contextParts.join('\n\n');
  return {
    rawText,
    products: matchedProducts,
    orders: userOrders,
    isSellerAction,
    toString() {
      return this.rawText;
    },
  };
};
