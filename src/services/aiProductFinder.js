import mongoose from 'mongoose';
import { Product } from '../models/Product.js';
import { normalizeText, KNOWN_CATEGORIES } from './aiIntentClassifier.js';

/**
 * Service de recherche, filtrage par budget, comparaison et recommandation
 * de produits réels depuis le catalogue MongoDB de Vicky-Shop.
 */

const ENGLISH_TO_FRENCH = {
  shoes: 'chaussures',
  shoe: 'chaussures',
  dress: 'robes',
  dresses: 'robes',
  pants: 'pantalons',
  shirt: 'chemises',
  bag: 'sacs',
  bags: 'sacs',
  watch: 'montres',
  suit: 'costumes',
  men: 'homme',
  women: 'femme',
};

// Nettoie et extrait les mots signifiants d'une requête utilisateur
export const extractSearchTerms = (rawText = '') => {
  const norm = normalizeText(rawText);
  const stopWords = new Set([
    'quel', 'quels', 'quelle', 'quelles', 'sont', 'votre', 'vos', 'avez', 'combien',
    'avoir', 'avec', 'pour', 'dans', 'chez', 'vous', 'montre', 'moi', 'donne', 'prix',
    'veux', 'cherche', 'trouver', 'avoir', 'acheter', 'catalogue', 'boutique', 'vicky', 'shop',
    'what', 'how', 'much', 'the', 'and', 'for', 'any'
  ]);

  return norm
    .replace(/[^\w\s-]/gi, ' ')
    .split(/\s+/)
    .map((w) => ENGLISH_TO_FRENCH[w] || w)
    .filter((w) => w.length > 2 && !stopWords.has(w));
};

/**
 * Recherche des produits réels selon les mots-clés et le budget.
 */
export const findCatalogProducts = async ({
  query = '',
  category = null,
  budget = { minPrice: null, maxPrice: null },
  limit = 4,
}) => {
  if (mongoose.connection.readyState !== 1) return [];

  const filter = { isActive: { $ne: false }, isArchived: { $ne: true } };

  // Filtre budgétaire
  if (budget.minPrice !== null || budget.maxPrice !== null) {
    filter.price = {};
    if (budget.minPrice !== null) filter.price.$gte = budget.minPrice;
    if (budget.maxPrice !== null) filter.price.$lte = budget.maxPrice;
  }

  // Filtre de catégorie
  if (category) {
    const cleanCat = normalizeText(category);
    filter.category = new RegExp(cleanCat, 'i');
  }

  const terms = extractSearchTerms(query);
  if (terms.length > 0 && !category) {
    // Détection si un terme correspond à une catégorie connue
    const foundCat = terms.find((t) => KNOWN_CATEGORIES.includes(t));
    if (foundCat) {
      filter.category = new RegExp(foundCat, 'i');
    } else {
      const regexPattern = new RegExp(terms.join('|'), 'i');
      filter.$or = [
        { title: regexPattern },
        { category: regexPattern },
        { description: regexPattern },
        { brand: regexPattern },
      ];
    }
  }

  try {
    let products = await Product.find(filter)
      .sort({ inStock: -1, createdAt: -1 })
      .limit(limit)
      .select('title price originalPrice category image images stockQuantity inStock slug badge')
      .lean();

    // Fallback : si aucun résultat avec budget strict, proposer les plus proches disponibles
    if (products.length === 0 && (budget.minPrice !== null || budget.maxPrice !== null)) {
      delete filter.price;
      products = await Product.find(filter)
        .sort({ price: 1 })
        .limit(3)
        .select('title price originalPrice category image images stockQuantity inStock slug badge')
        .lean();
    }

    return products.map(formatProductSnapshot);
  } catch (error) {
    console.warn('[aiProductFinder] Erreur lors de la recherche catalogue :', error.message);
    return [];
  }
};

/**
 * Compare deux ou plusieurs produits trouvés dans le catalogue.
 */
export const compareProducts = async (terms = []) => {
  if (mongoose.connection.readyState !== 1 || !terms || terms.length === 0) return [];

  try {
    const regexPattern = new RegExp(terms.join('|'), 'i');
    const matched = await Product.find({
      isActive: { $ne: false },
      isArchived: { $ne: true },
      title: regexPattern,
    })
      .limit(3)
      .select('title price originalPrice category stockQuantity inStock slug brand')
      .lean();

    return matched.map(formatProductSnapshot);
  } catch (err) {
    console.warn('[aiProductFinder] Erreur comparaison :', err.message);
    return [];
  }
};

/**
 * Propose des alternatives pour un article en rupture de stock.
 */
export const findAlternativesForProduct = async (product) => {
  if (mongoose.connection.readyState !== 1 || !product) return [];

  try {
    const alternatives = await Product.find({
      _id: { $ne: product._id },
      category: product.category,
      inStock: true,
      stockQuantity: { $gt: 0 },
      isActive: { $ne: false },
    })
      .limit(3)
      .select('title price originalPrice category image stockQuantity inStock slug badge')
      .lean();

    return alternatives.map(formatProductSnapshot);
  } catch {
    return [];
  }
};

/**
 * Formate un document Produit en snapshot structuré et sécurisé pour l'IA et le frontend.
 */
export const formatProductSnapshot = (prod) => {
  if (!prod) return null;

  const mainImage = prod.image || (Array.isArray(prod.images) && prod.images[0]) || '';
  const price = typeof prod.price === 'number' ? prod.price : 0;
  const inStock = prod.inStock !== false && (prod.stockQuantity === undefined || prod.stockQuantity > 0);

  return {
    _id: String(prod._id || prod.id || ''),
    title: prod.title || 'Article Vicky-Shop',
    price,
    originalPrice: prod.originalPrice || null,
    image: mainImage,
    category: prod.category || 'Mode',
    slug: prod.slug || String(prod._id || ''),
    inStock,
    stockQuantity: typeof prod.stockQuantity === 'number' ? prod.stockQuantity : 0,
    badge: prod.badge || (inStock ? null : 'Épuisé'),
  };
};
