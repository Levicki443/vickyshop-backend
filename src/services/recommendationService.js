import { Product } from '../models/Product.js';

/**
 * Extraction sémantique normalisée des mots-clés du type de produit.
 */
const extractTypeKeywords = (text = '') => {
  const normalized = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const patterns = [
    /\b(iphone|smartphone|telephone|phone|samsung|galaxy|xiaomi|redmi)\b/g,
    /\b(ordinateur|laptop|macbook|pc|portable|thinkpad)\b/g,
    /\b(casque|ecouteur|audio|earbuds|airpods|headphone)\b/g,
    /\b(montre|smartwatch|watch|bracelet)\b/g,
    /\b(chaussure|basket|sneaker|running|air max|soulier)\b/g,
    /\b(chemise|ensemble|short|bermuda|complet|pantalon|costume)\b/g,
    /\b(pull|sweat|hoodie|sweatshirt|veste|blouson|manteau)\b/g,
    /\b(casquette|chapeau|bonnet|bob)\b/g,
    /\b(sac|sacoche|maroquinerie|pochette|valise)\b/g,
    /\b(enceinte|speaker|baffle|soundbar)\b/g,
    /\b(television|tv|ecran|moniteur)\b/g,
  ];

  const matches = [];
  patterns.forEach((pattern) => {
    const found = normalized.match(pattern);
    if (found) matches.push(...found);
  });
  return Array.from(new Set(matches));
};

/**
 * Recherche intelligente des produits similaires selon l'algorithme multicritères :
 * Catégorie stricte, type sémantique exact, sous-catégorie, marque et proximité de prix.
 *
 * @param {Object} currentProduct - Le produit de référence actuellement consulté
 * @param {number} limit - Nombre maximum de produits à retourner
 * @returns {Promise<Array>} Liste des produits similaires ordonnés par pertinence
 */
export const findSimilarProducts = async (currentProduct, limit = 4) => {
  // Récupération des candidats actifs et en stock dans la MÊME catégorie principale
  const candidates = await Product.find({
    _id: { $ne: currentProduct._id },
    category: currentProduct.category,
    isArchived: { $ne: true },
    isActive: { $ne: false },
    inStock: true,
    stockQuantity: { $gt: 0 },
  }).populate('seller', 'name shopName isSellerActive');

  if (!candidates.length) return [];

  const targetTypes = extractTypeKeywords(
    `${currentProduct.title} ${currentProduct.subCategory || ''} ${currentProduct.description || ''}`
  );
  const targetBrand = (currentProduct.brand || '').trim().toLowerCase();
  const targetSubCategory = (currentProduct.subCategory || '').trim().toLowerCase();
  const targetPrice = Number(currentProduct.price) || 0;

  const scoredProducts = candidates.map((cand) => {
    let score = 0;
    const candTypes = extractTypeKeywords(
      `${cand.title} ${cand.subCategory || ''} ${cand.description || ''}`
    );
    const candBrand = (cand.brand || '').trim().toLowerCase();
    const candSubCategory = (cand.subCategory || '').trim().toLowerCase();
    const candPrice = Number(cand.price) || 0;

    // 1. Type exact de produit (critère prépondérant)
    const sharedTypes = targetTypes.filter((t) => candTypes.includes(t));
    if (sharedTypes.length > 0) {
      score += 80 + sharedTypes.length * 20;
    } else if (targetTypes.length > 0) {
      score -= 50; // Pénalité si le type diffère au sein de la catégorie
    }

    // 2. Même sous-catégorie
    if (targetSubCategory && candSubCategory && targetSubCategory === candSubCategory) {
      score += 40;
    }

    // 3. Même marque (si non générique)
    if (
      targetBrand &&
      !['generique', 'générique'].includes(targetBrand) &&
      targetBrand === candBrand
    ) {
      score += 25;
    }

    // 4. Proximité de prix (±35%)
    if (targetPrice > 0 && candPrice > 0) {
      const ratio = Math.abs(targetPrice - candPrice) / targetPrice;
      if (ratio <= 0.35) score += 15;
    }

    // 5. Note client supérieure ou égale à 4.5
    if (cand.rating >= 4.5) score += 5;

    return { product: cand, score };
  });

  return scoredProducts
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.product);
};
