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

const router = express.Router();

// Création de commande (Accessible à tous, associe le compte si token fourni)
router.post('/', (req, res, next) => {
  if (req.headers.authorization) {
    return protect(req, res, next);
  }
  next();
}, createOrder);

// Suivi client de ses propres commandes
router.get('/my-orders', protect, getMyOrders);

// Espace Vendeur : commandes reçues pour ses articles
router.get('/seller/my-orders', protect, requireSeller, getSellerOrders);
router.patch('/:orderId/items/:itemId/status', protect, requireSeller, updateSellerOrderItemStatus);

// Encaissement du paiement à la livraison (COD)
router.patch('/:id/confirm-payment', protect, requireAdmin, confirmOrderPayment);

// Suivi public par numéro de commande
router.get('/:orderNumber', getOrderByNumber);

export default router;
