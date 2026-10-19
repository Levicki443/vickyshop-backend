/**
 * Service de classification fine des intentions et d'extraction d'entités pour Vicky IA.
 * Tolérant aux fautes d'orthographe, abréviations, tournures familières et nouchi ivoirien.
 */

// Normalisation des chaînes pour recherche sémantique robuste
export const normalizeText = (text = '') => {
  return String(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
};

// Regex de détection du numéro de commande Vicky-Shop
export const ORDER_CODE_REGEX = /\b(CMD-[A-Z0-9]+)\b/i;

// Catégories reconnues du catalogue Vicky-Shop
export const KNOWN_CATEGORIES = [
  'robes', 'robe', 'chaussures', 'chaussure', 'sacs', 'sac',
  'chemises', 'chemise', 'pantalons', 'pantalon', 'vestes', 'veste',
  't-shirts', 't-shirt', 'accessoires', 'montres', 'montre', 'bijoux'
];

/**
 * Extrait le budget déclaré par l'utilisateur (min/max en FCFA).
 * Exemples gérés : "moins de 15 000", "budget 20k", "entre 10 000 et 25 000", "max 30000 FCFA".
 */
export const extractBudget = (rawText = '') => {
  const norm = normalizeText(rawText);
  let minPrice = null;
  let maxPrice = null;

  // Conversion "15k" -> "15000"
  const expanded = norm.replace(/(\d+)\s*k\b/g, (_, num) => `${num}000`);

  // Cas : "entre X et Y"
  const rangeMatch = expanded.match(/entre\s+(\d[\d\s]*)\s+et\s+(\d[\d\s]*)/);
  if (rangeMatch) {
    const minVal = parseInt(rangeMatch[1].replace(/\s+/g, ''), 10);
    const maxVal = parseInt(rangeMatch[2].replace(/\s+/g, ''), 10);
    if (!isNaN(minVal) && !isNaN(maxVal)) {
      return { minPrice: Math.min(minVal, maxVal), maxPrice: Math.max(minVal, maxVal) };
    }
  }

  // Cas : "moins de X", "max X", "maximum X", "jusqu'a X", "au plus X"
  const maxMatch = expanded.match(/(?:moins\s+de|max|maximum|jusqu['’]?a|au\s+plus|budget\s+de)\s+(\d[\d\s]*)/);
  if (maxMatch) {
    const val = parseInt(maxMatch[1].replace(/\s+/g, ''), 10);
    if (!isNaN(val) && val > 0) {
      maxPrice = val;
    }
  }

  // Cas : "plus de X", "au moins X", "a partir de X"
  const minMatch = expanded.match(/(?:plus\s+de|au\s+moins|[aà]\s+partir\s+de|min|minimum)\s+(\d[\d\s]*)/);
  if (minMatch) {
    const val = parseInt(minMatch[1].replace(/\s+/g, ''), 10);
    if (!isNaN(val) && val > 0) {
      minPrice = val;
    }
  }

  return { minPrice, maxPrice };
};

/**
 * Détecte si le message est une question de suivi dépendant du contexte précédent.
 */
export const isFollowUpQuestion = (rawText = '') => {
  const norm = normalizeText(rawText);
  const followUpPatterns = [
    /^(et\s+)?(combien|quel\s+est\s+le\s+prix|le\s+tarif|c['’]est\s+combien)/,
    /^(et\s+)?(comment\s+je\s+(fais|commande|l['’]achete|peux\s+l['’]avoir))/,
    /^(et\s+)?(montre|propose|donne)[- ]moi\s+d['’]autre(s)?/,
    /^(tu\s+as\s+en|il\s+y\s+a\s+en|dispo\s+en)\s+(rouge|noir|blanc|bleu|vert|jaune|s|m|l|xl|\d{2})/i,
    /^(et\s+)?la\s+livraison\s*\??$/i,
    /^(et\s+)?pour\s+(les\s+tailles|l['’]echange|le\s+retour)\s*\??$/i,
    /^c['’]est\s+(garanti|original|authentique|disponible)\s*\??$/i,
  ];

  return followUpPatterns.some((pattern) => pattern.test(norm));
};

/**
 * Identifie l'intention principale d'un message utilisateur.
 */
export const classifyUserIntent = (rawText = '', previousSubject = null) => {
  const norm = normalizeText(rawText);
  const budget = extractBudget(rawText);
  const hasOrderCode = ORDER_CODE_REGEX.test(rawText);
  const isFollowUp = isFollowUpQuestion(rawText);

  // 1. Réclamation / Problème / Support humain
  if (/\b(drap|litige|probleme|reclamation|plainte|arnaque|erreur|abime|vole|trompe)\b/.test(norm)) {
    return { type: 'SUPPORT_COMPLAINT', budget, isFollowUp };
  }

  // 2. Gestion Vendeur & Ajout d'articles
  if (
    (/\b(vendre|vendeur|boutique|djandjou|fournisseur)\b/.test(norm) ||
      (/\b(ajouter|creer|publier|mettre en vente|enregistrer)\b/.test(norm) &&
        /\b(article|produit|robe|chaussure|catalogue|photo)\b/.test(norm)))
  ) {
    return { type: 'SELLER_GUIDE', budget, isFollowUp };
  }

  // 3. Suivi de commande
  if (hasOrderCode || /\b(suivre|suivi|statut|colis|arrive quand|ou est mon colis|ou en est)\b/.test(norm)) {
    return { type: 'ORDER_TRACKING', budget, isFollowUp, orderCode: rawText.match(ORDER_CODE_REGEX)?.[1] || null };
  }

  // 4. Comment commander / Guide d'achat
  if (
    /\b(comment|passer|faire|effectuer|valider)\b/.test(norm) &&
    /\b(commande|commander|achat|acheter)\b/.test(norm)
  ) {
    return { type: 'ORDER_GUIDE', budget, isFollowUp };
  }

  // 5. Modalités de paiement (Cash on Delivery)
  if (/\b(paiement|payer|especes|cash|argent|regler|orange money|wave|moov|mtn|carte bancaire)\b/.test(norm)) {
    return { type: 'PAYMENT_INFO', budget, isFollowUp };
  }

  // 6. Frais et délais de livraison
  if (/\b(livraison|frais|delai|expedition|vous livrez|abidjan|yopougon|cocody|koumassi|marcory|bouake)\b/.test(norm)) {
    return { type: 'DELIVERY_INFO', budget, isFollowUp };
  }

  // 7. Échanges, tailles et retours sous 48h
  if (/\b(echange|echanger|taille|pointure|retour|retourner|essayer|essayage|rembourser)\b/.test(norm)) {
    return { type: 'EXCHANGE_RETURN', budget, isFollowUp };
  }

  // 8. Comparaison de produits
  if (/\b(comparer|comparaison|difference|lequel est mieux|laquelle est mieux|le meilleur entre)\b/.test(norm)) {
    return { type: 'PRODUCT_COMPARE', budget, isFollowUp };
  }

  // 9. Création de compte / Connexion
  if (/\b(creer un compte|inscription|inscrire|connexion|connecter|mot de passe|mon compte)\b/.test(norm)) {
    return { type: 'ACCOUNT_INFO', budget, isFollowUp };
  }

  // 10. Recherche produit (explicite ou par budget ou question de suivi)
  const hasProductKeywords = /\b(produit|article|robe|chaussure|sac|pantalon|chemise|veste|montre|prix|combien|stock|disponible|modele|catalogue)\b/.test(norm);
  if (hasProductKeywords || budget.maxPrice !== null || budget.minPrice !== null || (isFollowUp && previousSubject)) {
    return { type: 'PRODUCT_SEARCH', budget, isFollowUp };
  }

  return { type: 'GENERAL_INQUIRY', budget, isFollowUp };
};
