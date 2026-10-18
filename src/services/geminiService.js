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
 * Réponse experte locale de secours si aucune clé API Gemini n'est configurée ou si le quota est atteint.
 */
const getFallbackResponse = (userMessage, dynamicContext = '', userRole = 'client') => {
  const lower = userMessage.toLowerCase();

  if (lower.includes('commande') || lower.includes('suivi') || lower.includes('colis')) {
    if (dynamicContext && dynamicContext.includes('CMD-')) {
      return `Voici les informations vérifiées sur vos commandes récentes :\n${dynamicContext}\n\nVous pouvez cliquer sur le bouton ci-dessous pour ouvrir le suivi en direct.`;
    }
    return 'Pour suivre votre commande en direct, accédez à votre espace ou saisissez votre numéro de commande (ex: **CMD-123456**). Notre équipe vous livre en 24h à 48h ouvrées avec paiement en espèces à la livraison.';
  }

  if (lower.includes('vendeur') || lower.includes('vendre') || lower.includes('boutique') || userRole === 'vendeur') {
    return 'En tant que vendeur sur Vicky-Shop, vous disposez d\'un espace dédié pour publier vos articles, fixer vos prix en FCFA, gérer vos stocks et partager vos produits sur WhatsApp, TikTok et Facebook via vos liens de partage !\n\n[ACTION:SELLER_DASHBOARD]';
  }

  if (lower.includes('livraison') || lower.includes('frais') || lower.includes('délai') || lower.includes('combien')) {
    return 'Chez Vicky-Shop, la livraison standard à Abidjan est de **2 000 FCFA**, et elle est **totalement GRATUITE dès 50 000 FCFA** d\'achats ! Les délais sont de 24h à 48h ouvrées sur toutes les communes (Cocody, Yopougon, Marcory, etc.).';
  }

  if (lower.includes('paiement') || lower.includes('payer') || lower.includes('carte') || lower.includes('argent') || lower.includes('espèces')) {
    return 'Le paiement s\'effectue exclusivement **en espèces à la livraison (Cash on Delivery)**. Vous inspectez votre colis avant de régler directement le livreur en espèces.';
  }

  if (lower.includes('aide') || lower.includes('humain') || lower.includes('problème') || lower.includes('réclamation') || lower.includes('litige')) {
    return 'Notre service client humain est à votre entière écoute pour vous assister par WhatsApp au **+225 05 54 72 65 74**.\n\n[ACTION:WHATSAPP_SUPPORT]';
  }

  if (dynamicContext && dynamicContext.includes('ARTICLES RÉELS')) {
    return `Voici les articles disponibles actuellement dans la boutique :\n${dynamicContext}\n\nN'hésitez pas à cliquer sur l'un d'eux pour voir la fiche détaillée !`;
  }

  return 'Bonjour ! Je suis Vicky IA, votre conseillère officielle Vicky-Shop. Je suis à votre entière disposition pour vous guider sur nos collections, le suivi de vos commandes, les tarifs de livraison (2 000 FCFA, gratuite dès 50 000 FCFA) ou votre compte vendeur. Comment puis-je vous aider aujourd\'hui ?';
};

/**
 * Envoie la conversation au modèle Google Gemini via l'API REST v1beta officielle.
 */
export const queryGeminiAssistant = async ({
  message,
  conversationHistory = [],
  userName = 'cher client',
  userRole = 'client',
  dynamicContext = '',
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
  const systemInstructionText = await buildSystemInstruction(userName, userRole, dynamicContext);

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
        reply: getFallbackResponse(message),
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
        reply: getFallbackResponse(message),
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
      reply: getFallbackResponse(message),
      isFallback: true,
    };
  }
};
