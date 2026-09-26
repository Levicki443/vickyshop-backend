import mongoose from 'mongoose';

/**
 * Schéma Mongoose pour les Articles d'une Commande.
 */
const orderItemSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
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
  },
  { _id: false }
);

/**
 * Schéma Mongoose pour les Commandes (Orders) de Vicky-Shop.
 */
const orderSchema = new mongoose.Schema(
  {
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
      validate: [(val) => val.length > 0, 'Le panier ne peut pas être vide'],
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
    paymentMethod: {
      type: String,
      required: [true, 'Le moyen de paiement est requis'],
      enum: ['wave', 'orange-money', 'orange', 'mtn-momo', 'mtn', 'carte', 'livraison', 'cash'],
      default: 'livraison',
    },
    paymentStatus: {
      type: String,
      enum: ['en_attente', 'paye', 'echoue', 'rembourse'],
      default: 'en_attente',
    },
    orderStatus: {
      type: String,
      enum: ['recue', 'en_preparation', 'en_livraison', 'livree', 'annulee'],
      default: 'recue',
      index: true,
    },
    statusHistory: [
      {
        status: { type: String, required: true },
        updatedAt: { type: Date, default: Date.now },
        comment: { type: String, default: '' },
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
