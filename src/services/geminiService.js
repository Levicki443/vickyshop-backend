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

import { getFallbackResponse } from './aiFallbackService.js';
export { getFallbackResponse };

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
