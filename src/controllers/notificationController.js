import { Notification } from '../models/Notification.js';

/**
 * Récupère les notifications du client connecté.
 */
export const getClientNotifications = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const notifications = await Notification.find({ userId })
      .sort({ createdAt: -1 })
      .limit(30);

    const unreadCount = await Notification.countDocuments({ userId, isRead: false });

    res.status(200).json({
      status: 'success',
      data: {
        notifications,
        unreadCount,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Marque une notification client comme lue.
 */
export const markClientNotificationRead = async (req, res, next) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { $set: { isRead: true } },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({
        status: 'error',
        message: 'Notification introuvable.',
      });
    }

    res.status(200).json({
      status: 'success',
      data: { notification },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Marque toutes les notifications du client comme lues.
 */
export const markAllClientNotificationsRead = async (req, res, next) => {
  try {
    await Notification.updateMany(
      { userId: req.user._id, isRead: false },
      { $set: { isRead: true } }
    );

    res.status(200).json({
      status: 'success',
      message: 'Toutes les notifications ont été marquées comme lues.',
    });
  } catch (error) {
    next(error);
  }
};
