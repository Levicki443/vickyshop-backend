/**
 * Utilitaire de génération et de normalisation de slugs pour les URLs publiques Vicky-Shop.
 * Gère rigoureusement les accents français, la ponctuation, les emojis et les collisions.
 */

/**
 * Nettoie une chaîne de caractères pour produire un slug lisible, propre et adapté aux URLs.
 * @param {string} text - Le titre ou texte source.
 * @param {number} [maxLength=80] - Longueur maximale du slug.
 * @returns {string} - Le slug normalisé en minuscules.
 */
export const createSlug = (text, maxLength = 80) => {
  if (!text || typeof text !== 'string') {
    return 'produit';
  }

  const cleaned = text
    .normalize('NFD') // Décompose les accents (ex: "é" -> "e" + accent)
    .replace(/[\u0300-\u036f]/g, '') // Supprime les marques diacritiques (accents)
    .toLowerCase()
    .replace(/['’]/g, '-') // Remplace apostrophes par des tirets
    .replace(/[^a-z0-9]+/g, '-') // Remplace tout caractère non alphanumérique par un tiret
    .replace(/^-+|-+$/g, '') // Retire les tirets en début et fin de chaîne
    .replace(/-{2,}/g, '-'); // Évite les tirets consécutifs multiples

  if (!cleaned) {
    return 'produit';
  }

  if (cleaned.length <= maxLength) {
    return cleaned;
  }

  // Tronque proprement au dernier tiret avant la limite pour éviter de couper un mot
  const truncated = cleaned.slice(0, maxLength);
  const lastHyphenIndex = truncated.lastIndexOf('-');
  return (lastHyphenIndex > 20 ? truncated.slice(0, lastHyphenIndex) : truncated).replace(/-+$/, '');
};

/**
 * Génère un slug unique garanti contre les collisions en interrogeant la base de données.
 * @param {string} title - Titre du produit.
 * @param {import('mongoose').Model} ProductModel - Le modèle Mongoose Product.
 * @param {string|import('mongoose').Types.ObjectId|null} [currentProductId=null] - Identifiant du produit à exclure.
 * @returns {Promise<string>} - Un slug unique garanti.
 */
export const generateUniqueProductSlug = async (title, ProductModel, currentProductId = null) => {
  const baseSlug = createSlug(title);
  let candidateSlug = baseSlug;
  let counter = 1;

  while (true) {
    const query = { slug: candidateSlug };
    if (currentProductId) {
      query._id = { $ne: currentProductId };
    }

    const exists = await ProductModel.exists(query);
    if (!exists) {
      return candidateSlug;
    }

    counter += 1;
    // Si collision, on suffixe par -2, -3, ou un court hash dérivé de l'id
    if (counter <= 10) {
      candidateSlug = `${baseSlug}-${counter}`;
    } else {
      const stableSuffix = currentProductId
        ? String(currentProductId).slice(-4)
        : Math.random().toString(36).substring(2, 6);
      candidateSlug = `${baseSlug}-${stableSuffix}-${counter}`;
    }
  }
};
