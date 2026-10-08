import mongoose from 'mongoose';

/**
 * Schéma Mongoose pour les Articles d'une Commande (OrderItem).
 * Conserve la référence vers le vendeur pour la ventilation et l'isolation Marketplace.
 */
const orderItemSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      default: null,
    },
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    sellerName: {
      type: String,
      default: 'Vicky-Shop',
    },
    title: {
      type: String,
      required: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      default: 1,
    },
    image: {
      type: String,
      default: '',
    },
    size: {
      type: String,
      default: '',
    },
    color: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: ['en_attente', 'confirmee', 'en_preparation', 'expediee', 'en_livraison', 'livree', 'annulee', 'refusee', 'retournee'],
      default: 'en_attente',
    },
  },
  { _id: true }
);

/**
 * Schéma Mongoose pour les Commandes (Orders) de Vicky-Shop Marketplace.
 * Paiement exclusivement en espèces à la livraison (Cash on Delivery).
 */
const orderSchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    orderNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    customerName: {
      type: String,
      required: [true, 'Le nom du client est requis'],
      trim: true,
    },
    customerPhone: {
      type: String,
      required: [true, 'Le numéro de téléphone est requis'],
      trim: true,
      index: true,
    },
    customerEmail: {
      type: String,
      trim: true,
      lowercase: true,
      default: '',
    },
    deliveryAddress: {
      type: String,
      required: [true, 'L\'adresse de livraison est requise'],
      trim: true,
    },
    city: {
      type: String,
      default: 'Abidjan',
      trim: true,
    },
    deliveryNotes: {
      type: String,
      default: '',
      trim: true,
    },
    items: {
      type: [orderItemSchema],
      required: [true, 'La commande doit contenir au moins un article'],
      validate: [(val) => val && val.length > 0, 'Le panier ne peut pas être vide'],
    },
    subtotal: {
      type: Number,
      required: true,
      min: 0,
    },
    discount: {
      type: Number,
      default: 0,
      min: 0,
    },
    shippingCost: {
      type: Number,
      default: 0,
      min: 0,
    },
    total: {
      type: Number,
      required: true,
      min: 0,
    },
    amountToCollect: {
      type: Number,
      required: true,
      min: 0,
    },
    paymentMethod: {
      type: String,
      required: [true, 'Le moyen de paiement est requis'],
      enum: ['livraison', 'CASH_ON_DELIVERY', 'cash'],
      default: 'livraison',
    },
    paymentStatus: {
      type: String,
      enum: ['en_attente', 'paye', 'non_encaisse', 'refuse', 'rembourse'],
      default: 'en_attente',
      index: true,
    },
    orderStatus: {
      type: String,
      enum: [
        'recue',
        'confirmee',
        'en_preparation',
        'expediee',
        'en_livraison',
        'livree',
        'annulee',
        'refusee',
        'retournee',
        'echec_livraison',
      ],
      default: 'recue',
      index: true,
    },
    paymentConfirmedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    paidAt: {
      type: Date,
      default: null,
    },
    deliveredAt: {
      type: Date,
      default: null,
    },
    statusHistory: [
      {
        previousStatus: { type: String, default: '' },
        newStatus: { type: String, default: '' },
        status: { type: String, required: true },
        updatedAt: { type: Date, default: Date.now },
        changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        changedByName: { type: String, default: '' },
        changedByRole: {
          type: String,
          enum: ['vendeur', 'admin', 'client', 'systeme', 'livreur'],
          default: 'systeme',
        },
        comment: { type: String, default: '' },
        orderNumber: { type: String, default: '' },
      },
    ],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtuals de compatibilité pour le frontend
orderSchema.virtual('customer').get(function () {
  return {
    name: this.customerName,
    phone: this.customerPhone,
    email: this.customerEmail,
  };
});

orderSchema.virtual('deliveryDetails').get(function () {
  return {
    address: this.deliveryAddress,
    city: this.city,
    notes: this.deliveryNotes,
  };
});

orderSchema.virtual('discountAmount').get(function () {
  return this.discount;
});

export const Order = mongoose.model('Order', orderSchema);
