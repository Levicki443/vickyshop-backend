import mongoose from 'mongoose';

/**
 * Schéma Mongoose pour les sessions de discussion de l'Assistant IA (Vicky IA).
 * Enregistre les échanges, rattachés à un sessionId (visiteur) ou userId (client connecté).
 * Inclut le support des cartes produits interactives et des balises d'action structurées.
 */
const chatMessageSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      enum: ['user', 'assistant'],
      required: true,
    },
    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: [4000, 'Le message ne peut pas dépasser 4000 caractères'],
    },
    products: {
      type: [
        {
          _id: { type: String },
          title: { type: String },
          price: { type: Number },
          originalPrice: { type: Number, default: null },
          image: { type: String },
          category: { type: String },
          slug: { type: String },
          inStock: { type: Boolean, default: true },
          stockQuantity: { type: Number, default: 0 },
          badge: { type: String, default: null },
        },
      ],
      default: [],
    },
    actions: {
      type: [
        {
          type: { type: String },
          param: { type: String, default: '' },
          label: { type: String, default: '' },
        },
      ],
      default: [],
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    isSafe: {
      type: Boolean,
      default: true,
    },
  },
  { _id: true }
);

const chatConversationSchema = new mongoose.Schema(
  {
    sessionId: {
      type: String,
      required: [true, 'Le sessionId est obligatoire'],
      unique: true,
      index: true,
      trim: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    userName: {
      type: String,
      default: 'Visiteur',
      trim: true,
    },
    messages: {
      type: [chatMessageSchema],
      default: [],
    },
    lastActivity: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Nettoyage automatique des conversations anonymes inactives après 60 jours
chatConversationSchema.index({ lastActivity: 1 }, { expireAfterSeconds: 60 * 24 * 60 * 60 });

export const ChatConversation = mongoose.model('ChatConversation', chatConversationSchema);
