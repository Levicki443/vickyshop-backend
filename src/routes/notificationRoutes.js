import express from 'express';
import {
  getClientNotifications,
  markClientNotificationRead,
  markAllClientNotificationsRead,
} from '../controllers/notificationController.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.get('/', protect, getClientNotifications);
router.patch('/:id/read', protect, markClientNotificationRead);
router.patch('/read-all', protect, markAllClientNotificationsRead);

export default router;
