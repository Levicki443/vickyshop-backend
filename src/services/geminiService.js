import { config } from '../config/environment.js';
import { buildSystemInstruction } from './aiKnowledgeBase.js';
import { securityLog } from '../utils/securityLogger.js';

/**
 * Service d'intégration de l'API Google Gemini avec double couche de censure
 * et protection contre le prompt injection et le reverse engineering.
 */

// Motifs de censure préalable (Couche 1 : Heuristique et motifs stricts)
const PROHIBITED_PATTERNS = [
  /\b(sexe|sexuel\w*|porno\w*|pornographi\w*|nudit[eé]|xxx|masturb\w*|viol\w*|p[eé]dophil\w*)\b/i,
  /\b(tuer|meurtre\w*|assassin\w*|[eé]gorger\w*|d[eé]capit\w*|sanglant\w*|bain de sang|terroris\w*|attentat\w*|suicid\w*|mutil\w*|tortur\w*|fusillade\w*)\b/i,
  /\b(violence\w*|agressi\w*|massacr\w*|bombe\w*|explosif\w*|kalashnikov|arme [aà] feu|coca[iï]ne|h[eé]ro[iï]ne|drogue\w*|m[eé]tamph[eé]tamine)\b/i,
  /(ignore\s+(toutes\s+les\s+|all\s+)?(instructions\s+pr[eé]c[eé]dentes|previous\s+instructions|prior\s+instructions))/i,
  /(system\s+prompt|reveal\s+(your\s+)?prompt|show\s+instructions|affiche\s+(ton\s+)?prompt|r[eé]v[eè]le\s+(tes\s+)?instructions)/i,
  /\b(dan\s+mode|jailbreak|jailbroken|mode\s+d[eé]veloppeur\s+d[eé]bloqu[eé]|contourne\s+les\s+r[eè]gles)\b/i,
  /(qui\s+t['’]a\s+con[cç]u|donne\s+moi\s+tes\s+secrets|base\s+de\s+donn[eé]es\s+interne)/i,
];

export const checkInputSafety = (message) => {
  if (!message || typeof message !== 'string') return { safe: true };

  for (const pattern of PROHIBITED_PATTERNS) {
    if (pattern.test(message)) {
      return {
        safe: false,
        reason: 'Contenu inapproprié ou non conforme aux règles d\'utilisation de Vicky-Shop.',
      };
    }
  }

  return { safe: true };
};

/**
 * Réponse experte locale de haute qualité en cas d'absence temporaire de clé Gemini ou quota.
 * Utilise les données réelles extraites de MongoDB.
 */
export const getFallbackResponse = (userMessage, dynamicContext = null, userRole = 'client') => {
  const clean = (userMessage || '').trim();
  const lower = clean.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  const products = Array.isArray(dynamicContext?.products) ? dynamicContext.products : [];
  const orders = Array.isArray(dynamicContext?.orders) ? dynamicContext.orders : [];
  const intentType = dynamicContext?.intent?.type;

  // 1. Réclamation / Litige / Problème
  if (intentType === 'SUPPORT_COMPLAINT' || /\b(drap|litige|probleme|reclamation|plainte|arnaque)\b/.test(lower)) {
    return 'Je comprends tout à fait votre situation et nous prenons votre préoccupation très au sérieux.\n\n' +
      'Pour résoudre cela dans les plus brefs délais :\n' +
      '• Munissez-vous de votre numéro de commande (ex: **CMD-XXXXXX**).\n' +
      '• Notre équipe du service client examine votre dossier sans délai.\n' +
      '• Cliquez sur le bouton ci-dessous pour ouvrir directement la discussion avec notre responsable support sur WhatsApp :\n\n' +
      '[ACTION:WHATSAPP_SUPPORT]';
  }

  // 2. Intention : Gestion Espace Vendeur
  if (intentType === 'SELLER_GUIDE' || /\b(vendre|vendeur|boutique|djandjou|fournisseur)\b/.test(lower) || (userRole === 'vendeur' && lower.includes('produit'))) {
    return 'Pour vendre et ajouter un article sur Vicky-Shop, voici les étapes à suivre :\n\n' +
      '1️⃣ **Connexion Vendeur** : Connectez-vous avec votre compte vendeur.\n' +
      '2️⃣ **Accédez à l\'Espace Vendeur** : Cliquez sur « Espace Vendeur » ou utilisez le bouton ci-dessous.\n' +
      '3️⃣ **Ajouter un produit** : Dans l\'onglet « Produits », cliquez sur le bouton **« + Ajouter un produit »**.\n' +
      '4️⃣ **Renseignez la fiche** : Titre clair, catégorie, prix en FCFA, stock disponible, description et photos nettes.\n' +
      '5️⃣ **Publication & Partage** : Cliquez sur « Enregistrer ». Votre produit est immédiatement visible en boutique avec un lien de partage pour WhatsApp, TikTok et Facebook !\n\n' +
      '[ACTION:SELLER_DASHBOARD]';
  }

  // 3. Intention : Modalités de paiement
  if (intentType === 'PAYMENT_INFO' || /\b(paiement|payer|especes|cash|argent|regler|orange money|wave|moov|mtn)\b/.test(lower)) {
    return 'Sur Vicky-Shop, le mode de règlement est le **Paiement en espèces à la livraison (Cash on Delivery)** :\n\n' +
      '• Vous ne payez **rien à l\'avance** sur le site.\n' +
      '• Le livreur vous remet votre colis à l\'adresse convenue.\n' +
      '• Vous ouvrez et inspectez votre colis.\n' +
      '• Vous réglez directement le montant exact en espèces (Francs CFA) au livreur.\n\n' +
      'C\'est la garantie d\'un achat 100 % sécurisé et sans mauvaise surprise !';
  }

  // 4. Intention : Passer commande / Comment acheter
  if (intentType === 'ORDER_GUIDE' || (/\b(comment|passer|faire|effectuer|valider)\b/.test(lower) && /\b(commande|commander|achat|acheter)\b/.test(lower))) {
    return 'Passer commande sur Vicky-Shop est très simple, rapide et 100 % sécurisé :\n\n' +
      '1️⃣ **Sélectionnez vos articles** : Parcourez notre catalogue et choisissez vos coups de cœur (taille, couleur, quantité).\n' +
      '2️⃣ **Ajoutez au panier** : Cliquez sur « Ajouter au panier », puis ouvrez votre panier pour vérifier vos articles.\n' +
      '3️⃣ **Validez votre livraison** : Renseignez vos coordonnées (nom, numéro de téléphone joignable et commune à Abidjan). **Aucune carte bancaire n\'est demandée !**\n' +
      '4️⃣ **Paiement à la livraison** : Notre livreur vous contacte sous 24h à 48h ouvrées. Vous vérifiez votre colis avant de régler en **espèces (Cash on Delivery)**.\n\n' +
      'Avez-vous besoin d\'aide pour trouver un article particulier ?';
  }

  // 5. Intention : Suivi de commande
  if (intentType === 'ORDER_TRACKING' || orders.length > 0 || /\b(CMD-[A-Z0-9]+)\b/i.test(clean)) {
    if (orders.length > 0) {
      const orderList = orders.map((o) =>
        `• **Commande N° ${o.orderNumber}** : Statut = "${o.status}", Montant = ${o.totalAmount?.toLocaleString('fr-FR')} FCFA\n[ACTION:TRACK_ORDER:${o.orderNumber}]`
      ).join('\n\n');
      return `Voici les informations vérifiées sur vos commandes récentes :\n\n${orderList}\n\nCliquez sur le bouton ci-dessus pour ouvrir le suivi en direct.`;
    }
    return 'Pour suivre votre commande en direct :\n' +
      '• Si vous êtes connecté, consultez votre rubrique « Mes Commandes ».\n' +
      '• Ou envoyez-moi directement votre numéro de commande (ex: **CMD-123456**).\n\n' +
      'Nos livreurs assurent la livraison en 24h à 48h ouvrées sur tout Abidjan avec règlement en espèces à la livraison.';
  }

  // 6. Intention : Frais & Délais de livraison
  if (intentType === 'DELIVERY_INFO' || /\b(livraison|frais|delai|combien la livraison|expedition|abidjan|yopougon|cocody|marcory)\b/.test(lower)) {
    return 'Voici notre politique de livraison claire et transparente sur Vicky-Shop :\n\n' +
      '🚚 **Tarif standard à Abidjan** : **2 000 FCFA** seulement sur toutes les communes (Cocody, Yopougon, Marcory, Plateau, Koumassi, Treichville, Port-Bouët, Adjamé, Abobo...).\n' +
      '🎁 **Livraison GRATUITE** : Offerte automatiquement dès **50 000 FCFA** d\'achats dans votre panier !\n' +
      '⏱️ **Délais** : 24h à 48h ouvrées à Abidjan (et 48h à 72h vers l\'intérieur du pays).\n' +
      '📦 **Paiement** : Exclusivement en espèces au livreur après contrôle de votre colis.';
  }

  // 7. Intention : Échanges et retours
  if (intentType === 'EXCHANGE_RETURN' || /\b(echange|echanger|taille|pointure|retour|retourner|essayage|remboursement)\b/.test(lower)) {
    return 'Chez Vicky-Shop, votre satisfaction est garantie :\n\n' +
      '✨ **Contrôle à la livraison** : Vous inspectez immédiatement le produit dès la remise par le livreur.\n' +
      '🔄 **Échange sous 48h** : Si la taille d\'un vêtement ou d\'une chaussure ne convient pas, nous réalisons un échange sous **48 heures ouvrées** (l\'article doit rester neuf dans son emballage avec ses étiquettes).\n' +
      '💬 Pour demander un échange rapide, contactez notre équipe sur WhatsApp :\n\n' +
      '[ACTION:WHATSAPP_SUPPORT]';
  }

  // 8. Intention : Articles en stock dans le catalogue
  if (products.length > 0) {
    const list = products.map((p) =>
      `• **${p.title}** (${p.category}) — **${p.price?.toLocaleString('fr-FR')} FCFA**${p.inStock ? ` (Stock : ${p.stockQuantity})` : ' (En rupture)'}\n[ACTION:VIEW_PRODUCT:${p.slug || p._id}]`
    ).join('\n\n');
    return `Voici des articles disponibles actuellement dans la boutique :\n\n${list}\n\nVous pouvez cliquer sur une fiche pour l'examiner ou l'ajouter directement à votre panier !`;
  }

  // 9. Intention : Création de compte / Connexion
  if (intentType === 'ACCOUNT_INFO' || /\b(creer un compte|inscription|inscrire|connexion)\b/.test(lower)) {
    return 'Pour créer un compte ou vous connecter sur Vicky-Shop :\n\n' +
      '• Cliquez sur le bouton « Connexion » en haut de page.\n' +
      '• Vous pouvez choisir entre un profil **Client** (pour commander et suivre vos achats) ou **Vendeur** (pour publier votre propre catalogue).\n\n' +
      '[ACTION:AUTH_MODAL]';
  }

  // 10. Salutation générale
  return 'Bonjour ! Je suis Vicky IA, votre conseillère officielle Vicky-Shop.\n\n' +
    'Je suis à votre entière disposition 24h/24 pour vous guider :\n' +
    '• Trouver des articles tendance selon vos goûts et votre budget en FCFA\n' +
    '• Vous guider pour passer commande avec paiement en espèces à la livraison\n' +
    '• Suivre vos commandes existantes\n' +
    '• Vous accompagner pour vendre sur votre espace vendeur\n\n' +
    'Comment puis-je vous aider aujourd\'hui ?';
};

/**
 * Envoie la conversation au modèle Google Gemini via l'API REST v1beta officielle.
 */
export const queryGeminiAssistant = async ({
  message,
  conversationHistory = [],
  userName = 'cher client',
  userRole = 'client',
  dynamicContext = null,
  clientIp = '',
}) => {
  const safetyCheck = checkInputSafety(message);
  if (!safetyCheck.safe) {
    securityLog.accessDenied({
      userId: null,
      role: 'ai_user',
      route: '/api/ai/chat',
      method: 'POST',
      ip: clientIp,
      reason: `Message bloqué par le filtre de sécurité IA : ${safetyCheck.reason}`,
    });

    return {
      reply: 'Désolé, je ne peux pas répondre à cette demande. En tant que conseiller officiel de Vicky-Shop, je réponds exclusivement aux questions concernant la boutique, nos produits et nos services de livraison.',
      products: [],
      actions: [],
      isSafe: false,
    };
  }

  const apiKey = config.gemini.apiKey;
  const model = config.gemini.model || 'gemini-1.5-flash';
  const products = Array.isArray(dynamicContext?.products) ? dynamicContext.products : [];
  const actions = Array.isArray(dynamicContext?.actions) ? dynamicContext.actions : [];

  if (!apiKey) {
    return {
      reply: getFallbackResponse(message, dynamicContext, userRole),
      products,
      actions,
      isFallback: true,
      isSafe: true,
    };
  }

  const contextString = dynamicContext ? (dynamicContext.rawText || dynamicContext.toString()) : '';
  const systemInstructionText = await buildSystemInstruction(userName, userRole, contextString);

  const formattedHistory = [];
  const recentHistory = conversationHistory.slice(-8);

  for (const item of recentHistory) {
    if (item.content && item.role) {
      formattedHistory.push({
        role: item.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: item.content }],
      });
    }
  }

  formattedHistory.push({
    role: 'user',
    parts: [{ text: message }],
  });

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const requestBody = {
    systemInstruction: { parts: [{ text: systemInstructionText }] },
    contents: formattedHistory,
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_LOW_AND_ABOVE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_LOW_AND_ABOVE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_LOW_AND_ABOVE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_LOW_AND_ABOVE' },
    ],
    generationConfig: {
      temperature: 0.6,
      topP: 0.95,
      maxOutputTokens: 850,
    },
  };

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('[Gemini API] Erreur retournée :', data.error?.message || response.statusText);
      return {
        reply: getFallbackResponse(message, dynamicContext, userRole),
        products,
        actions,
        isFallback: true,
        isSafe: true,
      };
    }

    const candidate = data.candidates?.[0];
    if (candidate?.finishReason === 'SAFETY') {
      return {
        reply: 'Votre message a été filtré par nos règles de sécurité. Je vous invite à me poser une question concernant la boutique Vicky-Shop.',
        products: [],
        actions: [],
        isSafe: false,
      };
    }

    const replyText = candidate?.content?.parts?.[0]?.text;
    if (!replyText) {
      return {
        reply: getFallbackResponse(message, dynamicContext, userRole),
        products,
        actions,
        isFallback: true,
        isSafe: true,
      };
    }

    return {
      reply: replyText.trim(),
      products,
      actions,
      isSafe: true,
    };
  } catch (error) {
    console.error('[Gemini API] Erreur réseau / fetch :', error.message);
    return {
      reply: getFallbackResponse(message, dynamicContext, userRole),
      products,
      actions,
      isFallback: true,
      isSafe: true,
    };
  }
};
