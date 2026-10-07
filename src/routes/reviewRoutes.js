import express from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/environment.js';
import { User } from '../models/User.js';
import { protect, requireAdmin } from '../middlewares/authMiddleware.js';
import {
  getApprovedReviews,
  createReview,
  getMyReviews,
} from '../controllers/reviewController.js';
import {
  getAllReviewsAdmin,
  updateReviewStatus,
  toggleReviewActive,
  updateReviewAdmin,
  deleteReviewAdmin,
} from '../controllers/adminReviewController.js';

const router = express.Router();

/**
 * Middleware d'authentification optionnelle :
 * Attache l'utilisateur s'il a envoyé un token valide, sinon continue en mode invité.
 */
const optionalAuth = async (req, res, next) => {
  try {
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      const token = req.headers.authorization.split(' ')[1];
      if (token) {
        const decoded = jwt.verify(token, config.jwt.secret);
        const user = await User.findById(decoded.id);
        if (user) {
          req.user = user;
        }
      }
    }
  } catch {
    // Si le token est invalide ou expiré, on continue sans utilisateur connecté
  }
  next();
};

// --- ROUTES PUBLIQUES & CLIENT ---

// Récupérer les avis approuvés pour la boutique ou un produit
router.get('/', getApprovedReviews);

// Déposer un nouvel avis (Client authentifié ou invité avec commande)
router.post('/', optionalAuth, createReview);

// Consulter ses propres avis (Authentifié)
router.get('/my', protect, getMyReviews);

// --- ROUTES D'ADMINISTRATION (BACKOFFICE) ---

// Lister tous les avis avec KPIs
router.get('/admin', protect, requireAdmin, getAllReviewsAdmin);

// Mettre à jour le statut de modération (approuver / refuser / pending)
router.patch('/admin/:id/status', protect, requireAdmin, updateReviewStatus);

// Masquer ou afficher un avis
router.patch('/admin/:id/toggle', protect, requireAdmin, toggleReviewActive);

// Modifier le contenu ou ajouter une réponse admin
router.put('/admin/:id', protect, requireAdmin, updateReviewAdmin);

// Supprimer définitivement un avis
router.delete('/admin/:id', protect, requireAdmin, deleteReviewAdmin);

export default router;
