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
 */
export const getFallbackResponse = (userMessage, dynamicContext = null, userRole = 'client') => {
  const clean = (userMessage || '').trim();
  const lower = clean.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  const products = Array.isArray(dynamicContext?.products) ? dynamicContext.products : [];
  const orders = Array.isArray(dynamicContext?.orders) ? dynamicContext.orders : [];

  // 1. Intention : Ajouter un article / Gestion Espace Vendeur
  const isSellerAdding =
    /\b(ajouter|creer|publier|mettre en vente|enregistrer|inserer)\b/.test(lower) &&
    /\b(article|produit|robe|chaussure|item|photo|catalogue)\b/.test(lower);

  const isSellerGeneral =
    isSellerAdding ||
    /\b(vendre|vendeur|boutique|djandjou|fournisseur)\b/.test(lower) ||
    (userRole === 'vendeur' && (lower.includes('espace') || lower.includes('produit')));

  if (isSellerGeneral) {
    return 'Pour ajouter un article et vendre sur Vicky-Shop, suivez ces étapes simples :\n\n' +
      '1️⃣ **Connexion Vendeur** : Connectez-vous avec votre compte vendeur (ou inscrivez-vous en choisissant le profil « Vendeur »).\n' +
      '2️⃣ **Accédez à l\'Espace Vendeur** : Cliquez sur « Espace Vendeur » dans le menu ou utilisez le bouton ci-dessous.\n' +
      '3️⃣ **Ajouter un produit** : Dans l\'onglet « Produits », cliquez sur le bouton **« + Ajouter un produit »**.\n' +
      '4️⃣ **Renseignez la fiche** : Indiquez le titre, la catégorie, le prix en FCFA, la quantité en stock, la description et importez de belles photos nettes.\n' +
      '5️⃣ **Publication & Partage** : Cliquez sur « Enregistrer ». Votre produit est instantanément en ligne et vous bénéficiez d\'un bouton de partage direct pour WhatsApp, TikTok et Facebook !\n\n' +
      '[ACTION:SELLER_DASHBOARD]';
  }

  // 2. Intention : Paiement & Modalités de règlement (prioritaire sur les questions de commande)
  const isPayment = /\b(paiement|payer|carte|especes|cash|argent|regler|orange money|wave|moov|mtn)\b/.test(lower);
  if (isPayment) {
    return 'Sur Vicky-Shop, le mode de règlement est le **Paiement en espèces à la livraison (Cash on Delivery)** :\n\n' +
      '• Vous ne payez **rien à l\'avance** sur le site.\n' +
      '• Le livreur vous remet votre colis à l\'adresse convenue.\n' +
      '• Vous ouvrez et inspectez votre colis.\n' +
      '• Vous réglez directement le montant exact en espèces (Francs CFA) au livreur.\n\n' +
      'C\'est la garantie d\'un achat 100 % sécurisé et sans mauvaise surprise !';
  }

  // 3. Intention : Comment passer une commande / Comment acheter
  const isOrderingGuide =
    /\b(passer|faire|comment|effectuer|enregistrer|valider)\b/.test(lower) &&
    /\b(commande|commander|achat|acheter)\b/.test(lower);

  if (isOrderingGuide || lower.includes('comment acheter') || lower.includes('comment commander')) {
    return 'Passer commande sur Vicky-Shop est très simple, rapide et 100 % sécurisé :\n\n' +
      '1️⃣ **Sélectionnez vos articles** : Parcourez notre catalogue et choisissez vos coups de cœur (taille, couleur, quantité).\n' +
      '2️⃣ **Ajoutez au panier** : Cliquez sur le bouton « Ajouter au panier », puis ouvrez votre panier en haut de l\'écran pour vérifier vos articles.\n' +
      '3️⃣ **Validez votre livraison** : Cliquez sur « Commander » et renseignez vos coordonnées (nom, numéro de téléphone joignable et commune/quartier à Abidjan). **Aucune carte bancaire n\'est demandée !**\n' +
      '4️⃣ **Paiement à la livraison** : Notre livreur vous contacte en 24h à 48h ouvrées. Vous vérifiez votre colis avant de régler directement en **espèces (Cash on Delivery)**.\n\n' +
      'Avez-vous besoin d\'aide pour trouver un article en particulier ?';
  }

  // 4. Intention : Suivi de commande / Où est mon colis
  const hasOrderCode = /\b(CMD-[A-Z0-9]+)\b/i.test(clean);
  const isTracking = hasOrderCode || /\b(suivre|suivi|statut|colis|arrive quand|ou est)\b/.test(lower);

  if (isTracking || orders.length > 0) {
    if (orders.length > 0) {
      const orderList = orders.map((o) =>
        `• **Commande N° ${o.orderNumber}** : Statut = "${o.status}", Montant = ${o.totalAmount?.toLocaleString('fr-FR')} FCFA\n[ACTION:TRACK_ORDER:${o.orderNumber}]`
      ).join('\n\n');
      return `Voici les informations vérifiées sur vos commandes récentes :\n\n${orderList}\n\nVous pouvez cliquer sur le bouton ci-dessus pour ouvrir le suivi en direct.`;
    }
    return 'Pour suivre votre commande en direct :\n' +
      '• Si vous êtes connecté, accédez à votre rubrique « Mes Commandes ».\n' +
      '• Ou envoyez-moi directement votre numéro de commande (ex: **CMD-123456**).\n\n' +
      'Nos livreurs assurent la livraison en 24h à 48h ouvrées sur tout Abidjan avec règlement en espèces à la livraison.';
  }

  // 5. Intention : Frais, Délais et Modalités de Livraison
  if (/\b(livraison|frais|delai|combien la livraison|expedition|vous livrez|abidjan|yopougon|cocody|koumassi|marcory|plateau|bouake|interieur)\b/.test(lower)) {
    return 'Voici notre politique de livraison claire et transparente sur Vicky-Shop :\n\n' +
      '🚚 **Tarif standard à Abidjan** : **2 000 FCFA** seulement sur toutes les communes (Cocody, Yopougon, Marcory, Plateau, Koumassi, Treichville, Port-Bouët, Adjamé, Abobo, Bingerville...).\n' +
      '🎁 **Livraison GRATUITE** : Offerte automatiquement dès **50 000 FCFA** d\'achats dans votre panier !\n' +
      '⏱️ **Délais** : 24h à 48h ouvrées à Abidjan (et 48h à 72h vers l\'intérieur du pays).\n' +
      '📦 **Paiement** : Exclusivement en espèces au livreur après contrôle de votre colis.';
  }

  // 6. Intention : Échange, Tailles, Essayage et Retours
  if (/\b(echange|echanger|taille|pointure|retour|retourner|essayer|essayage|rembourser|remboursement)\b/.test(lower)) {
    return 'Chez Vicky-Shop, votre satisfaction est garantie :\n\n' +
      '✨ **Contrôle à la livraison** : Vous inspectez immédiatement le produit dès la remise par le livreur.\n' +
      '🔄 **Échange sous 48h** : Si la taille d\'un vêtement ou d\'une chaussure ne convient pas, nous réalisons un échange sous **48 heures ouvrées** (l\'article doit rester neuf dans son emballage avec ses étiquettes).\n' +
      '💬 Pour demander un échange rapide, contactez notre équipe sur WhatsApp :\n\n' +
      '[ACTION:WHATSAPP_SUPPORT]';
  }

  // 7. Intention : Articles en stock / Catalogue disponible
  if (products.length > 0) {
    const list = products.map((p) =>
      `• **${p.title}** (${p.category}) — **${p.price?.toLocaleString('fr-FR')} FCFA**\n[ACTION:VIEW_PRODUCT:${p.slug || p._id}]`
    ).join('\n\n');
    return `Voici des articles disponibles actuellement dans la boutique :\n\n${list}\n\nN'hésitez pas à cliquer sur l'un d'eux pour ouvrir sa fiche détaillée ou l'ajouter à votre panier !`;
  }

  // 8. Intention : Assistance humaine / Service Client / Réclamation
  if (/\b(aide|humain|contact|numero|telephone|whatsapp|service client|probleme|reclamation|litige|plainte|ya drap)\b/.test(lower)) {
    return 'Notre service client officiel Vicky-Shop est à votre entière écoute :\n\n' +
      '📱 **Assistance WhatsApp** : **+225 05 54 72 65 74**\n' +
      '🕒 Disponible du lundi au samedi pour vous guider dans vos achats, vos livraisons ou la gestion de votre boutique.\n\n' +
      '[ACTION:WHATSAPP_SUPPORT]';
  }

  // 9. Salutations ou question générale
  return 'Bonjour ! Je suis Vicky IA, votre conseillère officielle Vicky-Shop.\n\n' +
    'Je suis à votre entière disposition 24h/24 pour vous guider :\n' +
    '• Vous aider à trouver des articles tendance (vêtements, chaussures, accessoires)\n' +
    '• Vous guider pour passer commande avec paiement en espèces à la livraison\n' +
    '• Vous renseigner sur la livraison (2 000 FCFA à Abidjan, gratuite dès 50 000 FCFA)\n' +
    '• Vous accompagner pour vendre et ajouter des articles sur votre espace vendeur\n\n' +
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
  // 1. Censure de sécurité préalable (Couche 1)
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
      isSafe: false,
    };
  }

  const apiKey = config.gemini.apiKey;
  const model = config.gemini.model || 'gemini-1.5-flash';

  // 2. Si la clé n'est pas encore renseignée, réponse de secours de haute qualité
  if (!apiKey) {
    return {
      reply: getFallbackResponse(message, dynamicContext, userRole),
      isFallback: true,
    };
  }

  // 3. Construction des instructions système et du contexte historique
  const contextString = dynamicContext ? (dynamicContext.rawText || dynamicContext.toString()) : '';
  const systemInstructionText = await buildSystemInstruction(userName, userRole, contextString);

  // Préparation de la fenêtre glissante de contexte (8 derniers échanges max)
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

  // Ajout du message actuel
  formattedHistory.push({
    role: 'user',
    parts: [{ text: message }],
  });

  // 4. Appel à l'API Google Gemini
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const requestBody = {
    systemInstruction: {
      parts: [{ text: systemInstructionText }],
    },
    contents: formattedHistory,
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_LOW_AND_ABOVE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_LOW_AND_ABOVE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_LOW_AND_ABOVE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_LOW_AND_ABOVE' },
    ],
    generationConfig: {
      temperature: 0.7,
      topP: 0.95,
      maxOutputTokens: 800,
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
      console.error('[Gemini API] Erreur retournée par Google :', data.error?.message || response.statusText);
      return {
        reply: getFallbackResponse(message, dynamicContext, userRole),
        isFallback: true,
      };
    }

    const candidate = data.candidates?.[0];
    if (candidate?.finishReason === 'SAFETY') {
      return {
        reply: 'Votre message a été filtré par nos règles de sécurité. Je vous invite à me poser une question concernant la boutique Vicky-Shop.',
        isSafe: false,
      };
    }

    const replyText = candidate?.content?.parts?.[0]?.text;
    if (!replyText) {
      return {
        reply: getFallbackResponse(message, dynamicContext, userRole),
        isFallback: true,
      };
    }

    return {
      reply: replyText.trim(),
      isSafe: true,
    };
  } catch (error) {
    console.error('[Gemini API] Erreur réseau / fetch :', error.message);
    return {
      reply: getFallbackResponse(message, dynamicContext, userRole),
      isFallback: true,
    };
  }
};
