import express from 'express';
import {
  getSellerDashboardStats,
  getSellerNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  getSellerProfile,
  updateSellerProfile,
  upgradeToSeller,
  uploadSellerProductImage,
} from '../controllers/sellerController.js';
import { protect, requireSeller } from '../middlewares/authMiddleware.js';
import { uploadSingleImage } from '../middlewares/uploadMiddleware.js';

const router = express.Router();

// Permet à un client connecté d'activer son statut vendeur
router.post('/upgrade', protect, upgradeToSeller);

// Routes protégées réservées aux vendeurs
router.post('/upload', protect, requireSeller, uploadSingleImage, uploadSellerProductImage);
router.get('/stats', protect, requireSeller, getSellerDashboardStats);
router.get('/notifications', protect, requireSeller, getSellerNotifications);
router.patch('/notifications/:id/read', protect, requireSeller, markNotificationAsRead);
router.patch('/notifications/read-all', protect, requireSeller, markAllNotificationsAsRead);
router.get('/profile', protect, requireSeller, getSellerProfile);
router.patch('/profile', protect, requireSeller, updateSellerProfile);

export default router;

