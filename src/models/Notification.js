import mongoose from 'mongoose';

/**
 * Schéma Mongoose pour les Notifications Unifiées et Sécurisées (Client, Vendeur & Administrateur).
 * Conserve l'historique complet des alertes de commande, des baisses de prix,
 * des nouveaux produits, des promotions et des notifications système.
 */
const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    role: {
      type: String,
      enum: ['client', 'vendeur', 'admin'],
      default: 'client',
      index: true,
    },
    type: {
      type: String,
      enum: [
        'order_new',
        'order_status',
        'order_confirmed',
        'order_in_preparation',
        'order_shipped',
        'order_delivered',
        'price_drop',
        'new_product',
        'promo_ending',
        'stock_alert',
        'system',
      ],
      default: 'order_status',
      index: true,
    },
    title: {
      type: String,
      required: [true, 'Le titre de la notification est obligatoire'],
      trim: true,
      maxlength: [200, 'Le titre ne peut pas dépasser 200 caractères'],
    },
    message: {
      type: String,
      required: [true, 'Le message de la notification est obligatoire'],
      trim: true,
      maxlength: [1000, 'Le message ne peut pas dépasser 1000 caractères'],
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      default: null,
    },
    orderNumber: {
      type: String,
      default: '',
      trim: true,
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      default: null,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    readAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Index composés pour des requêtes ultra-rapides sur l'historique et les non-lues
notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ sellerId: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, type: 1, createdAt: -1 });
notificationSchema.index({ sellerId: 1, type: 1, createdAt: -1 });

export const Notification = mongoose.model('Notification', notificationSchema);
