import express from 'express';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { config } from '../config/environment.js';
import { User } from '../models/User.js';
import {
  handleChatMessage,
  getChatHistory,
  resetChatSession,
  getSuggestions,
} from '../controllers/aiChatController.js';

const router = express.Router();

/**
 * Limiteur de requêtes spécifique aux échanges avec Vicky IA.
 * Protège le quota de l'API Gemini et prévient le spam de requêtes.
 */
const chatLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 requêtes max par minute
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    code: 429,
    message: 'Vous envoyez des messages à Vicky IA trop rapidement. Veuillez patienter quelques instants.',
  },
});

/**
 * Middleware d'authentification facultative.
 * Si un jeton JWT valide est présent, rattache le profil de l'utilisateur à req.user.
 * Si aucun jeton n'est présent, permet à l'utilisateur de continuer en tant que visiteur anonyme.
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      if (token) {
        const decoded = jwt.verify(token, config.jwt.secret);
        const user = await User.findById(decoded.id).select('name role status');
        if (user && user.status !== 'suspendu' && user.status !== 'desactive') {
          req.user = user;
        }
      }
    }
  } catch {
    // En cas de jeton invalide ou expiré, on continue sans bloquer l'accès visiteur
  }
  next();
};

// Route pour envoyer un message à Vicky IA
router.post('/chat', chatLimiter, optionalAuth, handleChatMessage);

// Route pour récupérer l'historique d'une session
router.get('/history/:sessionId', getChatHistory);

// Route pour réinitialiser la session
router.delete('/session/:sessionId', resetChatSession);

// Route pour obtenir les suggestions prédéfinies
router.get('/suggestions', getSuggestions);

export default router;
