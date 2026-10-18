import mongoose from 'mongoose';
import { ChatConversation } from '../models/ChatConversation.js';
import { queryGeminiAssistant } from '../services/geminiService.js';
import { resolveDynamicContext } from '../services/aiContextResolver.js';

/**
 * Suggestions de questions prédéfinies pour amorcer immédiatement la discussion.
 */
export const DEFAULT_SUGGESTIONS = [
  {
    id: 'sug-1',
    label: 'Livraison & Frais',
    prompt: 'Quels sont vos tarifs et délais de livraison à Abidjan et à l\'intérieur ?',
  },
  {
    id: 'sug-2',
    label: 'Paiement à la livraison',
    prompt: 'Comment fonctionne le paiement en espèces à la livraison (Cash on Delivery) ?',
  },
  {
    id: 'sug-3',
    label: 'Devenir Vendeur',
    prompt: 'Comment puis-je m\'inscrire et vendre mes produits sur Vicky-Shop ?',
  },
  {
    id: 'sug-4',
    label: 'Échange & Tailles',
    prompt: 'Que faire si la taille d\'un vêtement ou d\'une paire de chaussures ne me convient pas ?',
  },
];

// Cache mémoire temporaire pour continuité de service si MongoDB est indisponible
const memorySessionStore = new Map();

/**
 * Traite et répond à un message utilisateur avec persistance de session et tolérance aux pannes.
 */
export const handleChatMessage = async (req, res, next) => {
  try {
    const { sessionId, message, userName: clientProvidedName } = req.body;
    const clientIp = req.ip || req.connection.remoteAddress;

    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({
        status: 'error',
        message: 'L\'identifiant de session (sessionId) est requis.',
      });
    }

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({
        status: 'error',
        message: 'Le message ne peut pas être vide.',
      });
    }

    const cleanMessage = message.trim();
    if (cleanMessage.length > 2000) {
      return res.status(400).json({
        status: 'error',
        message: 'Le message dépasse la limite autorisée de 2000 caractères.',
      });
    }

    const authUser = req.user;
    const isDbReady = mongoose.connection.readyState === 1;
    let conversation = null;

    if (isDbReady) {
      try {
        conversation = await ChatConversation.findOne({ sessionId });
      } catch (err) {
        console.warn('[aiChatController] Avertissement recherche MongoDB :', err.message);
      }
    }

    if (!conversation && memorySessionStore.has(sessionId)) {
      conversation = memorySessionStore.get(sessionId);
    }

    const resolvedUserName =
      authUser?.name ||
      clientProvidedName?.trim() ||
      conversation?.userName ||
      'cher client';

    const userRole = authUser?.role || 'visiteur';
    const historyMessages = conversation?.messages || [];

    // Résolution contextuelle dynamique (recherche produit réelle, commandes personnelles)
    const dynamicContext = await resolveDynamicContext({
      message: cleanMessage,
      user: authUser,
    });

    // Envoi à l'IA avec l'historique récent de la session et le contexte vérifié
    const aiResult = await queryGeminiAssistant({
      message: cleanMessage,
      conversationHistory: historyMessages,
      userName: resolvedUserName,
      userRole,
      dynamicContext,
      clientIp,
    });

    const now = new Date();
    const userMessageEntry = {
      role: 'user',
      content: cleanMessage,
      createdAt: now,
      isSafe: true,
    };

    const assistantMessageEntry = {
      role: 'assistant',
      content: aiResult.reply,
      createdAt: now,
      isSafe: aiResult.isSafe !== false,
    };

    // Sauvegarde persistante en base de données si disponible
    if (isDbReady) {
      try {
        if (!conversation || !(conversation instanceof ChatConversation)) {
          conversation = new ChatConversation({
            sessionId,
            userId: authUser?._id || null,
            userName: resolvedUserName,
            messages: [userMessageEntry, assistantMessageEntry],
          });
        } else {
          conversation.messages.push(userMessageEntry, assistantMessageEntry);
          conversation.lastActivity = now;
          if (authUser && !conversation.userId) {
            conversation.userId = authUser._id;
            conversation.userName = authUser.name;
          }
        }
        await conversation.save();
      } catch (err) {
        console.warn('[aiChatController] Avertissement écriture MongoDB :', err.message);
      }
    }

    // Sauvegarde en cache mémoire pour survie des sessions
    const updatedMemoryMessages = [...historyMessages, userMessageEntry, assistantMessageEntry];
    memorySessionStore.set(sessionId, {
      sessionId,
      userName: resolvedUserName,
      messages: updatedMemoryMessages.slice(-20),
    });

    res.status(200).json({
      status: 'success',
      data: {
        reply: aiResult.reply,
        sessionId,
        isSafe: aiResult.isSafe !== false,
        isFallback: !!aiResult.isFallback,
        createdAt: assistantMessageEntry.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Récupère l'historique complet d'une session de discussion.
 */
export const getChatHistory = async (req, res, next) => {
  try {
    const { sessionId } = req.params;

    if (!sessionId) {
      return res.status(400).json({
        status: 'error',
        message: 'Le sessionId est obligatoire.',
      });
    }

    if (mongoose.connection.readyState === 1) {
      try {
        const conversation = await ChatConversation.findOne({ sessionId }).lean();
        if (conversation) {
          return res.status(200).json({
            status: 'success',
            data: {
              sessionId,
              messages: conversation.messages || [],
              userName: conversation.userName || 'Visiteur',
            },
          });
        }
      } catch (err) {
        console.warn('[aiChatController] Avertissement getHistory MongoDB :', err.message);
      }
    }

    const memoryConv = memorySessionStore.get(sessionId);
    res.status(200).json({
      status: 'success',
      data: {
        sessionId,
        messages: memoryConv ? memoryConv.messages : [],
        userName: memoryConv ? memoryConv.userName : 'Visiteur',
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Réinitialise une session de discussion (Nouvelle discussion).
 */
export const resetChatSession = async (req, res, next) => {
  try {
    const { sessionId } = req.params;

    if (sessionId) {
      memorySessionStore.delete(sessionId);
      if (mongoose.connection.readyState === 1) {
        try {
          await ChatConversation.deleteOne({ sessionId });
        } catch {
          // Silencieux
        }
      }
    }

    res.status(200).json({
      status: 'success',
      message: 'Session de discussion réinitialisée avec succès.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Fournit les suggestions de questions rapides prédéfinies.
 */
export const getSuggestions = async (req, res) => {
  res.status(200).json({
    status: 'success',
    data: {
      suggestions: DEFAULT_SUGGESTIONS,
    },
  });
};
