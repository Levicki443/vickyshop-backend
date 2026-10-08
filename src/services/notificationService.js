import { Notification } from '../models/Notification.js';
import { User } from '../models/User.js';
import { notifyUser, notifySeller, notifyAdmins } from '../config/socket.js';
import { sendWebPushToUser } from './pushNotificationService.js';

/**
 * Service centralisé pour la création, la persistance et le dispatch en temps réel des notifications
 * (Socket.IO + Base de données MongoDB + Web Push Notifications).
 */

const STATUS_LABELS_FR = {
  en_attente: 'En attente de traitement',
  recue: 'Reçue et enregistrée',
  confirmee: 'Confirmée par le vendeur',
  en_preparation: 'En cours de préparation',
  expediee: 'Expédiée / Prise en charge',
  en_livraison: 'En cours de livraison',
  livree: 'Livrée avec succès',
  annulee: 'Annulée',
  refusee: 'Refusée à la livraison',
  retournee: 'Retournée',
};

export const createAndDispatchNotification = async ({
  userId = null,
  sellerId = null,
  role = 'client',
  type = 'order_status',
  title,
  message,
  orderId = null,
  orderNumber = '',
  productId = null,
  metadata = {},
  actionUrl = '',
}) => {
  try {
    const notification = await Notification.create({
      userId, sellerId, role, type, title, message, orderId, orderNumber, productId, metadata,
    });
    const notifData = notification.toObject();

    if (userId) notifyUser(userId.toString(), 'notification:new', notifData);
    if (sellerId) notifySeller(sellerId.toString(), 'notification:new', notifData);
    if (role === 'admin') notifyAdmins('notification:new', notifData);

    const targetUserId = userId || sellerId;
    if (targetUserId) {
      User.findById(targetUserId)
        .select('+pushSubscriptions notificationPreferences')
        .then((targetUser) => {
          if (targetUser) {
            sendWebPushToUser(targetUser, {
              title, message, orderNumber, productId, type,
              actionUrl: actionUrl || (orderNumber ? `/commandes` : `/`),
            }).catch((err) => console.warn('[NotificationService] Échec WebPush :', err.message));
          }
        })
        .catch(() => {});
    }
    return notification;
  } catch (error) {
    console.error('[NotificationService] Erreur création notification :', error.message);
    return null;
  }
};

/**
 * Déclenche les notifications lors de la création d'une nouvelle commande (Client & Vendeurs respectifs).
 */
export const notifyOrderCreated = async (order) => {
  if (!order) return;

  // 1. Notification pour le Client (si compte client connecté)
  if (order.customerId) {
    await createAndDispatchNotification({
      userId: order.customerId,
      role: 'client',
      type: 'order_new',
      title: 'Commande validée avec succès 🎉',
      message: `Votre commande #${order.orderNumber} d'un montant de ${order.total} FCFA a été transmise aux vendeurs.`,
      orderId: order._id,
      orderNumber: order.orderNumber,
      metadata: { total: order.total, itemsCount: order.items?.length || 0 },
      actionUrl: `/commandes`,
    });

    try {
      notifyUser(order.customerId.toString(), 'order:client:created', {
        orderNumber: order.orderNumber,
        total: order.total,
        status: 'recue',
      });
    } catch (e) {}
  }

  // 2. Regroupement par vendeur pour isolation stricte
  const sellersMap = {};
  (order.items || []).forEach((item) => {
    if (item.sellerId) {
      const sId = item.sellerId.toString();
      if (!sellersMap[sId]) sellersMap[sId] = [];
      sellersMap[sId].push(item);
    }
  });

  // 3. Notification ciblée et sécurisée pour chaque Vendeur concerné
  for (const [sId, sellerItems] of Object.entries(sellersMap)) {
    const sellerSubtotal = sellerItems.reduce((acc, i) => acc + i.price * i.quantity, 0);
    const itemsSummary = sellerItems.map((i) => `${i.quantity}x ${i.title}`).join(', ');

    await createAndDispatchNotification({
      sellerId: sId,
      role: 'vendeur',
      type: 'order_new',
      title: 'Nouvelle commande reçue 🔔',
      message: `Le client ${order.customerName} a commandé : ${itemsSummary} (Total : ${sellerSubtotal} FCFA).`,
      orderId: order._id,
      orderNumber: order.orderNumber,
      metadata: {
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        city: order.city,
        deliveryAddress: order.deliveryAddress,
        itemsCount: sellerItems.length,
        sellerTotal: sellerSubtotal,
      },
      actionUrl: `/vendeur/commandes`,
    });

    try {
      notifySeller(sId, 'order:seller:new', {
        orderId: order._id,
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        city: order.city,
        deliveryAddress: order.deliveryAddress,
        items: sellerItems,
        total: sellerSubtotal,
        amountToCollect: sellerSubtotal,
        createdAt: order.createdAt,
      });
    } catch (err) {}
  }
};

/**
 * Déclenche les notifications lors du changement de statut d'une commande.
 */
export const notifyOrderStatusChanged = async (order, newStatus, itemTitle = '') => {
  if (!order || !order.customerId) return;

  const statusLabel = STATUS_LABELS_FR[newStatus] || newStatus;
  let title = `Mise à jour : Commande #${order.orderNumber}`;
  let message = `Votre commande #${order.orderNumber} est désormais : ${statusLabel}.`;
  let notifType = 'order_status';

  if (newStatus === 'confirmee') {
    title = 'Commande confirmée 🔔';
    message = itemTitle
      ? `Votre article "${itemTitle}" de la commande #${order.orderNumber} a été confirmé.`
      : `Votre commande #${order.orderNumber} a été confirmée.`;
    notifType = 'order_confirmed';
  } else if (newStatus === 'en_preparation') {
    title = 'Commande en préparation 🟡';
    message = itemTitle
      ? `Votre article "${itemTitle}" est en cours de préparation.`
      : `Votre commande #${order.orderNumber} est actuellement en préparation.`;
    notifType = 'order_in_preparation';
  } else if (newStatus === 'expediee') {
    title = 'Commande expédiée 📦';
    message = itemTitle
      ? `Votre article "${itemTitle}" vient d'être expédié.`
      : `Votre commande #${order.orderNumber} vient d'être expédiée.`;
    notifType = 'order_shipped';
  } else if (newStatus === 'en_livraison') {
    title = 'Commande en livraison 🚚';
    message = itemTitle
      ? `Votre article "${itemTitle}" est en cours de livraison.`
      : `🚚 Votre commande #${order.orderNumber} est en cours de livraison.`;
    notifType = 'order_out_for_delivery';
  } else if (newStatus === 'livree') {
    title = 'Commande livrée ✅';
    message = itemTitle
      ? `Votre article "${itemTitle}" a été livré avec succès.`
      : `✅ Votre commande #${order.orderNumber} a été livrée avec succès.`;
    notifType = 'order_delivered';
  } else if (newStatus === 'annulee') {
    title = 'Commande annulée ❌';
    message = itemTitle
      ? `Votre article "${itemTitle}" a été annulé.`
      : `Votre commande #${order.orderNumber} a été annulée.`;
    notifType = 'order_cancelled';
  } else if (newStatus === 'refusee') {
    title = 'Commande refusée ⚠️';
    message = `La commande #${order.orderNumber} a été marquée comme refusée.`;
    notifType = 'order_refused';
  }

  await createAndDispatchNotification({
    userId: order.customerId,
    role: 'client',
    type: notifType,
    title,
    message,
    orderId: order._id,
    orderNumber: order.orderNumber,
    metadata: { status: newStatus, statusLabel, itemTitle },
    actionUrl: `/commandes`,
  });

  try {
    notifyUser(order.customerId.toString(), 'order:client:update', {
      orderNumber: order.orderNumber,
      status: newStatus,
      statusLabel,
      title,
      message,
      itemTitle,
      updatedAt: new Date(),
    });
  } catch (e) {}
};

/**
 * Alerte les clients ayant un produit dans leurs favoris en cas de baisse de prix.
 */
export const notifyProductPriceDrop = async (product, oldPrice, newPrice) => {
  if (!product || Number(newPrice) >= Number(oldPrice)) return;

  try {
    const interestedUsers = await User.find({
      favorites: product._id,
      'notificationPreferences.priceDrops': { $ne: false },
    }).select('_id notificationPreferences pushSubscriptions');

    const formattedOld = new Intl.NumberFormat('fr-FR').format(oldPrice);
    const formattedNew = new Intl.NumberFormat('fr-FR').format(newPrice);

    for (const u of interestedUsers) {
      await createAndDispatchNotification({
        userId: u._id,
        role: 'client',
        type: 'price_drop',
        title: 'Baisse de prix sur votre favori 🏷️',
        message: `Bonne nouvelle ! Le produit "${product.title}" passe de ${formattedOld} FCFA à ${formattedNew} FCFA.`,
        productId: product._id,
        metadata: {
          productTitle: product.title,
          oldPrice,
          newPrice,
          image: product.image || '',
        },
        actionUrl: `/produit/${product._id}`,
      });
    }
  } catch (err) {
    console.error('[NotificationService] Erreur notification baisse de prix :', err.message);
  }
};

/**
 * Alerte les utilisateurs intéressés lors de la publication d'un nouveau produit.
 */
export const notifyNewProductPublished = async (product) => {
  if (!product) return;

  try {
    const interestedUsers = await User.find({
      'notificationPreferences.newProducts': { $ne: false },
    })
      .limit(100)
      .select('_id notificationPreferences pushSubscriptions');

    const formattedPrice = new Intl.NumberFormat('fr-FR').format(product.price);

    for (const u of interestedUsers) {
      await createAndDispatchNotification({
        userId: u._id,
        role: 'client',
        type: 'new_product',
        title: 'Nouveau produit disponible ✨',
        message: `Découvrez la nouveauté "${product.title}" (${formattedPrice} FCFA) dans la catégorie ${product.category || 'Nouveautés'}.`,
        productId: product._id,
        metadata: {
          productTitle: product.title,
          price: product.price,
          category: product.category,
          image: product.image || '',
        },
        actionUrl: `/produit/${product._id}`,
      });
    }
  } catch (err) {
    console.error('[NotificationService] Erreur notification nouveau produit :', err.message);
  }
};
