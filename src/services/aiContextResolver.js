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
 * @returns {Promise<string>} Contexte textuel vérifié prêt à être injecté
 */
export const resolveDynamicContext = async ({ message, user = null }) => {
  if (mongoose.connection.readyState !== 1) {
    return '';
  }

  const lower = (message || '').toLowerCase();
  const contextParts = [];

  try {
    // 1. Détection et extraction des commandes du client connecté
    const isOrderInquiry = lower.includes('commande') || lower.includes('suivi') || lower.includes('colis') || ORDER_REGEX.test(message);

    if (isOrderInquiry) {
      if (user && user._id) {
        const orderMatch = message.match(ORDER_REGEX);
        let userOrders = [];

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
          contextParts.push(`
DONNÉES RÉELLES DES COMMANDES DU CLIENT (${user.name || 'Connecté'}) :
${userOrders.map((ord) => `- Commande N° ${ord.orderNumber} : Statut = "${ord.status}", Montant = ${ord.totalAmount?.toLocaleString('fr-FR')} FCFA, ${ord.items?.length || 0} article(s), Destination = ${ord.city} (${ord.deliveryAddress}). [Balise d'action à proposer : [ACTION:TRACK_ORDER:${ord.orderNumber}]]`).join('\n')}
CONSIGNE COMMANDE : Utilise ces informations réelles pour informer le client avec précision et lui proposer le bouton d'action.`);
        } else {
          contextParts.push(`\nINFORMATIONS COMMANDES : Le client ${user.name} n'a aucune commande enregistrée pour le moment.`);
        }
      } else {
        contextParts.push(`\nINFORMATIONS COMMANDES : L'utilisateur n'est pas connecté. Rappelle-lui poliment de se connecter ou de saisir son numéro de commande CMD-XXXXXX pour consulter son statut.`);
      }
    }

    // 2. Détection d'intention de recherche produit
    const containsProductKeyword = PRODUCT_KEYWORDS.some((kw) => lower.includes(kw));
    if (containsProductKeyword) {
      // Extraction des termes signifiants pour la recherche
      const cleanKeywords = lower
        .replace(/[^\w\s-]/gi, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 3 && !['quel', 'quels', 'quelle', 'quelles', 'sont', 'votre', 'vos', 'avez', 'combien', 'avoir'].includes(w));

      let matchedProducts = [];

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

      if (matchedProducts.length === 0) {
        matchedProducts = await Product.find({ inStock: true })
          .sort({ createdAt: -1 })
          .limit(4)
          .select('title price category stockQuantity slug _id')
          .lean();
      }

      if (matchedProducts.length > 0) {
        contextParts.push(`
ARTICLES RÉELS CORRESPONDANTS ACTUELLEMENT EN STOCK DANS VICKY-SHOP :
${matchedProducts.map((p) => `- "${p.title}" | Catégorie : ${p.category} | Prix exact : ${p.price?.toLocaleString('fr-FR')} FCFA | Disponibilité : En stock (${p.stockQuantity} unités). [Balise d'action : [ACTION:VIEW_PRODUCT:${p.slug || p._id}]]`).join('\n')}
CONSIGNE PRODUITS : Indique ces prix réels sans rien inventer. Propose la balise d'action [ACTION:VIEW_PRODUCT:identifiant] pour permettre au client d'ouvrir la fiche d'un clic.`);
      }
    }

    // 3. Contexte spécifique Vendeur
    if (user && (user.role === 'vendeur' || user.role === 'admin')) {
      const sellerProductsCount = await Product.countDocuments({ seller: user._id });
      contextParts.push(`
PROFIL VENDEUR CONNECTÉ :
- Nom : ${user.name}
- Rôle : Vendeur partenaire officiel
- Articles actifs dans sa boutique : ${sellerProductsCount}
CONSIGNES VENDEUR : Guide-le sur son espace vendeur. Propose la balise d'action [ACTION:SELLER_DASHBOARD] pour accéder à sa gestion des produits, commandes et liens de partage WhatsApp/TikTok.`);
    }
  } catch (err) {
    console.warn('[aiContextResolver] Erreur non bloquante de résolution de contexte :', err.message);
  }

  return contextParts.join('\n');
};
