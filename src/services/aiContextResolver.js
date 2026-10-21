import mongoose from 'mongoose';
import { Order } from '../models/Order.js';
import { Product } from '../models/Product.js';
import {
  classifyUserIntent,
  ORDER_CODE_REGEX,
  normalizeText,
} from './aiIntentClassifier.js';
import {
  findCatalogProducts,
  compareProducts,
  formatProductSnapshot,
} from './aiProductFinder.js';

/**
 * Service central de résolution contextuelle des données réelles de Vicky-Shop.
 * Interroge MongoDB en lecture seule avec isolation stricte des droits (RBAC).
 */

/**
 * Extrait le dernier sujet ou article mentionné dans l'historique récent de discussion.
 */
const extractLastSubjectFromHistory = (history = []) => {
  if (!Array.isArray(history) || history.length === 0) return null;

  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i];
    if (msg.role === 'assistant' && msg.content) {
      const match = msg.content.match(/\*\*([^*]+)\*\*/);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
  }
  return null;
};

/**
 * Résout le contexte dynamique complet pour la demande en cours.
 */
export const resolveDynamicContext = async ({
  message,
  user = null,
  conversationHistory = [],
  recentlyViewedIds = [],
}) => {
  const emptyResult = {
    rawText: '',
    products: [],
    orders: [],
    intent: { type: 'GENERAL_INQUIRY' },
    actions: [],
    isSellerAction: false,
    toString() {
      return this.rawText;
    },
  };

  if (!message || typeof message !== 'string') return emptyResult;

  const previousSubject = extractLastSubjectFromHistory(conversationHistory);
  const intent = classifyUserIntent(message, previousSubject);
  const contextParts = [];
  const actions = [];
  let matchedProducts = [];
  let userOrders = [];

  if (mongoose.connection.readyState !== 1) {
    return { ...emptyResult, intent };
  }

  try {
    // 1. Suivi des commandes personnelles (Isolation stricte RBAC)
    if (intent.type === 'ORDER_TRACKING' || (intent.type === 'SUPPORT_COMPLAINT' && user && user._id)) {
      const orderMatch = message.match(ORDER_CODE_REGEX);

      if (orderMatch && user && user._id) {
        const specificOrder = await Order.findOne({
          customerId: user._id,
          orderNumber: orderMatch[1].toUpperCase(),
        })
          .select('orderNumber status totalAmount items createdAt deliveryAddress city')
          .lean();

        if (specificOrder) userOrders = [specificOrder];
      }

      // Si aucune commande trouvée avec le code, récupérer les 3 dernières commandes de l'utilisateur connecté
      if (userOrders.length === 0 && user && user._id) {
        userOrders = await Order.find({ customerId: user._id })
          .sort({ createdAt: -1 })
          .limit(3)
          .select('orderNumber status totalAmount items createdAt deliveryAddress city')
          .lean();
      }

      if (userOrders.length > 0) {
        contextParts.push(
          `COMMANDES CLIENT CONFIRMÉES (${user.name || 'Client'}) :\n` +
            userOrders
              .map(
                (ord) =>
                  `• Commande N° ${ord.orderNumber} : Statut = "${ord.status}", Montant = ${ord.totalAmount?.toLocaleString('fr-FR')} FCFA, Destination = ${ord.city} (${ord.deliveryAddress}).`
              )
              .join('\n')
        );

        userOrders.forEach((o) => {
          actions.push({
            type: 'TRACK_ORDER',
            param: o.orderNumber,
            label: `Suivre la commande ${o.orderNumber}`,
          });
        });
      } else if (!user || !user._id) {
        actions.push({
          type: 'AUTH_MODAL',
          param: '',
          label: 'Se connecter pour voir mes commandes',
        });
      }
    }

    // 2. Recherche et recommandation dans le catalogue réel
    if (
      intent.type === 'PRODUCT_SEARCH' ||
      intent.type === 'PRODUCT_COMPARE' ||
      intent.type === 'RECOMMENDATION_SEEK' ||
      intent.isFollowUp
    ) {
      const effectiveQuery = intent.isFollowUp && previousSubject ? `${previousSubject} ${message}` : message;

      if (intent.type === 'PRODUCT_COMPARE') {
        const terms = effectiveQuery
          .replace(/[^\w\s-]/gi, ' ')
          .split(/\s+/)
          .filter((t) => t.length > 3);
        matchedProducts = await compareProducts(terms);
      } else {
        matchedProducts = await findCatalogProducts({
          query: effectiveQuery,
          budget: intent.budget,
          limit: 4,
        });
      }

      // Complément avec les articles récemment consultés si la recherche n'a rien donné
      if (matchedProducts.length === 0 && Array.isArray(recentlyViewedIds) && recentlyViewedIds.length > 0) {
        const viewedProducts = await Product.find({
          _id: { $in: recentlyViewedIds.slice(0, 3) },
          isActive: { $ne: false },
        })
          .select('title price originalPrice category image images stockQuantity inStock slug badge')
          .lean();
        matchedProducts = viewedProducts.map(formatProductSnapshot);
      }

      if (matchedProducts.length > 0) {
        contextParts.push(
          `ARTICLES DISPONIBLES DANS LE CATALOGUE VICKY-SHOP :\n` +
            matchedProducts
              .map(
                (p) =>
                  `• "${p.title}" | Catégorie : ${p.category} | Prix : ${p.price?.toLocaleString('fr-FR')} FCFA | Disponibilité : ${p.inStock ? `${p.stockQuantity} en stock` : 'En rupture'}`
              )
              .join('\n')
        );

        matchedProducts.forEach((p) => {
          actions.push({
            type: 'VIEW_PRODUCT',
            param: p.slug || p._id,
            label: `Voir ${p.title}`,
          });
        });
      }
    }

    // 3. Espace Vendeur connecté ou orientation inscription vendeur
    if (user && (user.role === 'vendeur' || user.role === 'admin')) {
      const sellerProductCount = await Product.countDocuments({ seller: user._id });
      contextParts.push(`ESPACE VENDEUR DE L'UTILISATEUR (${user.name}) : ${sellerProductCount} article(s) publié(s).`);
      actions.push({
        type: 'SELLER_DASHBOARD',
        param: '',
        label: 'Ouvrir mon Espace Vendeur',
      });
    } else if (intent.type === 'SELLER_GUIDE') {
      actions.push({
        type: 'SELLER_REGISTER',
        param: '',
        label: 'Créer un compte vendeur',
      });
    }

    // 4. Découverte de la plateforme
    if (intent.type === 'PLATFORM_ABOUT') {
      actions.push({
        type: 'EXPLORE_CATALOG',
        param: '',
        label: 'Découvrir la boutique',
      });
    }

    // 5. Action de support WhatsApp pour les réclamations
    if (intent.type === 'SUPPORT_COMPLAINT' || intent.type === 'EXCHANGE_RETURN') {
      actions.push({
        type: 'WHATSAPP_SUPPORT',
        param: '+2250554726574',
        label: 'Contacter le support WhatsApp (+225)',
      });
    }
  } catch (err) {
    console.warn('[aiContextResolver] Erreur non bloquante de résolution :', err.message);
  }

  const rawText = contextParts.join('\n\n');

  return {
    rawText,
    products: matchedProducts,
    orders: userOrders,
    intent,
    actions,
    isSellerAction: intent.type === 'SELLER_GUIDE',
    toString() {
      return this.rawText;
    },
  };
};
