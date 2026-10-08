import webpush from 'web-push';
import { User } from '../models/User.js';

/**
 * Service de Notifications Web Push (Standards PWA / VAPID).
 * Permet l'envoi de notifications push natives sur smartphone, tablette et ordinateur
 * même lorsque l'onglet ou le navigateur est en arrière-plan.
 */

// Configuration des clés VAPID (Depuis l'environnement ou clés générées de secours)
const defaultVapidKeys = {
  publicKey: process.env.VAPID_PUBLIC_KEY || 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U',
  privateKey: process.env.VAPID_PRIVATE_KEY || 'UUxI4SSsTjWKGbyL9b-s2P9y1r6kPqFwB-H4v9Z_3X8',
  subject: process.env.VAPID_EMAIL ? `mailto:${process.env.VAPID_EMAIL}` : 'mailto:support@vickyshop.ci',
};

let isVapidConfigured = false;

try {
  webpush.setVapidDetails(
    defaultVapidKeys.subject,
    defaultVapidKeys.publicKey,
    defaultVapidKeys.privateKey
  );
  isVapidConfigured = true;
} catch (err) {
  console.warn('[WebPush] Avertissement configuration VAPID :', err.message);
}

/**
 * Retourne la clé publique VAPID pour l'abonnement côté client.
 * @returns {string}
 */
export const getVapidPublicKey = () => {
  return defaultVapidKeys.publicKey;
};

/**
 * Envoie une notification Web Push à un utilisateur sur l'ensemble de ses appareils enregistrés.
 * Nettoie automatiquement les souscriptions expirées ou révoquées (Codes HTTP 404/410).
 * 
 * @param {Object} user - Instance Mongoose ou objet User
 * @param {Object} payload - Données de la notification
 * @returns {Promise<{ success: number, failed: number }>}
 */
export const sendWebPushToUser = async (user, payload) => {
  if (!isVapidConfigured || !user || !user.pushSubscriptions || user.pushSubscriptions.length === 0) {
    return { success: 0, failed: 0 };
  }

  // Vérifier si l'utilisateur autorise les notifications push
  if (user.notificationPreferences && user.notificationPreferences.pushNotifications === false) {
    return { success: 0, failed: 0 };
  }

  const notificationPayload = JSON.stringify({
    title: payload.title || 'Vicky-Shop',
    body: payload.message || '',
    icon: '/logo.png',
    badge: '/logo.png',
    tag: payload.tag || `vicky-${Date.now()}`,
    data: {
      url: payload.actionUrl || '/',
      orderNumber: payload.orderNumber || null,
      productId: payload.productId || null,
      type: payload.type || 'info',
    },
  });

  const deadEndpoints = [];
  let successCount = 0;
  let failedCount = 0;

  const pushPromises = user.pushSubscriptions.map(async (sub) => {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.keys.p256dh,
            auth: sub.keys.auth,
          },
        },
        notificationPayload
      );
      successCount += 1;
    } catch (pushErr) {
      failedCount += 1;
      // Code 404 (Not Found) ou 410 (Gone) = abonnement révoqué par le navigateur
      if (pushErr.statusCode === 404 || pushErr.statusCode === 410) {
        deadEndpoints.push(sub.endpoint);
      }
    }
  });

  await Promise.all(pushPromises);

  // Nettoyage automatique des abonnements morts en base de données
  if (deadEndpoints.length > 0 && user._id) {
    try {
      await User.findByIdAndUpdate(user._id, {
        $pull: { pushSubscriptions: { endpoint: { $in: deadEndpoints } } },
      });
    } catch (cleanupErr) {
      console.warn('[WebPush] Erreur nettoyage abonnements expirés :', cleanupErr.message);
    }
  }

  return { success: successCount, failed: failedCount };
};
