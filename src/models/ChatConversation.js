import mongoose from 'mongoose';

/**
 * Schéma Mongoose pour les sessions de discussion de l'Assistant IA (Vicky IA).
 * Enregistre les échanges, rattachés à un sessionId (visiteur) ou userId (client connecté).
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
