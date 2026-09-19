import mongoose from 'mongoose';

/**
 * Schéma Mongoose pour les Commandes (Orders) de Vicky-Shop.
 * Gère les articles achetés, le client, l'adresse de livraison et le moyen de paiement (Wave, OM, MoMo, etc.).
 */
const orderItemSchema = new mongoose.Schema(
  {
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
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    orderNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
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
      enum: ['wave', 'orange-money', 'mtn-momo', 'carte', 'livraison'],
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
    },
  },
  {
    timestamps: true,
  }
);

orderSchema.index({ customerPhone: 1 });

export const Order = mongoose.model('Order', orderSchema);
