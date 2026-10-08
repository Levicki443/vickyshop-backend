import express from 'express';
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  getPreferences,
  updatePreferences,
  subscribePush,
  unsubscribePush,
  getVapidPublicKeyHandler,
} from '../controllers/notificationController.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = express.Router();

// Clé publique VAPID (Accessible sans authentification pour initialiser le Service Worker)
router.get('/vapid-key', getVapidPublicKeyHandler);

// Routes protégées par authentification JWT
router.use(protect);

router.get('/', getNotifications);
router.patch('/read-all', markAllNotificationsRead);
router.patch('/:id/read', markNotificationRead);
router.delete('/:id', deleteNotification);

// Préférences et abonnements Push
router.get('/preferences', getPreferences);
router.put('/preferences', updatePreferences);
router.post('/push-subscribe', subscribePush);
router.post('/push-unsubscribe', unsubscribePush);

export default router;
