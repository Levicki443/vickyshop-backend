import express from 'express';
import {
  getSellerDashboardStats,
  getSellerNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  getSellerProfile,
  updateSellerProfile,
  upgradeToSeller,
} from '../controllers/sellerController.js';
import { protect, requireSeller } from '../middlewares/authMiddleware.js';

const router = express.Router();

// Permet à un client connecté d'activer son statut vendeur
router.post('/upgrade', protect, upgradeToSeller);

// Routes protégées réservées aux vendeurs
router.get('/stats', protect, requireSeller, getSellerDashboardStats);
router.get('/notifications', protect, requireSeller, getSellerNotifications);
router.patch('/notifications/:id/read', protect, requireSeller, markNotificationAsRead);
router.patch('/notifications/read-all', protect, requireSeller, markAllNotificationsAsRead);
router.get('/profile', protect, requireSeller, getSellerProfile);
router.patch('/profile', protect, requireSeller, updateSellerProfile);

export default router;
