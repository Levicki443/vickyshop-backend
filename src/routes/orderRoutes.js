import express from 'express';
import {
  createOrder,
  getOrderByNumber,
  getMyOrders,
  getSellerOrders,
  updateSellerOrderItemStatus,
  confirmOrderPayment,
} from '../controllers/orderController.js';
import { protect, requireSeller, requireAdmin } from '../middlewares/authMiddleware.js';
import { validateOrderPayload } from '../middlewares/validationMiddleware.js';
import { orderLimiter } from '../middlewares/rateLimitMiddleware.js';

const router = express.Router();

// Middleware d'authentification optionnelle pour lier l'utilisateur s'il est connecté
const optionalAuth = (req, res, next) => {
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    return protect(req, res, (err) => {
      // En cas d'erreur de jeton optionnel, on continue sans bloquer la création de commande
      next();
    });
  }
  next();
};

// Création de commande (Limité par rate-limiter et validé strictement)
router.post('/', orderLimiter, optionalAuth, validateOrderPayload, createOrder);

// Suivi client de ses propres commandes
router.get('/my-orders', protect, getMyOrders);

// Espace Vendeur : commandes concernant ses articles
router.get('/seller/my-orders', protect, requireSeller, getSellerOrders);
router.patch('/:orderId/items/:itemId/status', protect, requireSeller, updateSellerOrderItemStatus);

// Encaissement du paiement à la livraison (COD) réservé aux administrateurs
router.patch('/:id/confirm-payment', protect, requireAdmin, confirmOrderPayment);

// Suivi public ou privé par numéro de commande
router.get('/:orderNumber', optionalAuth, getOrderByNumber);

export default router;
