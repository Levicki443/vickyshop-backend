import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { ROLES, ALL_ROLES, normalizeRole } from '../utils/roleUtils.js';
import { generateRandomToken, hashToken } from '../utils/cryptoUtils.js';

/**
 * Schéma Mongoose pour les Utilisateurs de Vicky-Shop (Clients, Vendeurs, Administrateurs).
 * Inclut la gestion du verrouillage temporaire de compte, de la réinitialisation de mot de passe,
 * des préférences de notification fines, des abonnements Web Push et du contrôle d'accès RBAC.
 */
const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Le nom complet est obligatoire'],
      trim: true,
      minlength: [2, 'Le nom doit comporter au moins 2 caractères'],
      maxlength: [100, 'Le nom ne peut pas dépasser 100 caractères'],
    },
    email: {
      type: String,
      required: [true, 'L\'adresse email est obligatoire'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,})+$/,
        'Veuillez fournir une adresse email valide',
      ],
    },
    phone: {
      type: String,
      required: [true, 'Le numéro de téléphone est obligatoire'],
      trim: true,
    },
    password: {
      type: String,
      required: [true, 'Le mot de passe est obligatoire'],
      minlength: [8, 'Le mot de passe doit comporter au moins 8 caractères'],
      select: false, // Empêche l'exposition accidentelle du mot de passe dans les requêtes
    },
    role: {
      type: String,
      enum: {
        values: ALL_ROLES,
        message: 'Le rôle `{VALUE}` n\'est pas autorisé. Choix valides : client, vendeur, admin',
      },
      default: ROLES.CLIENT,
      set: (val) => normalizeRole(val, ROLES.CLIENT),
      index: true,
    },
    address: {
      type: String,
      trim: true,
      default: '',
      maxlength: [255, 'L\'adresse ne peut pas dépasser 255 caractères'],
    },
    city: {
      type: String,
      trim: true,
      default: 'Abidjan',
      maxlength: [100, 'La ville ne peut pas dépasser 100 caractères'],
    },
    // Informations spécifiques au Vendeur (Marketplace)
    shopName: {
      type: String,
      trim: true,
      default: '',
      maxlength: [120, 'Le nom de la boutique ne peut pas dépasser 120 caractères'],
    },
    shopDescription: {
      type: String,
      trim: true,
      default: '',
      maxlength: [1000, 'La description de la boutique ne peut pas dépasser 1000 caractères'],
    },
    shopPhone: {
      type: String,
      trim: true,
      default: '',
    },
    shopAddress: {
      type: String,
      trim: true,
      default: '',
    },
    isSellerActive: {
      type: Boolean,
      default: true,
    },
    // Préférences de Notifications (Client & Vendeur)
    notificationPreferences: {
      orders: { type: Boolean, default: true },
      delivery: { type: Boolean, default: true },
      newProducts: { type: Boolean, default: true },
      priceDrops: { type: Boolean, default: true },
      promotions: { type: Boolean, default: true },
      pushNotifications: { type: Boolean, default: true },
      soundEnabled: { type: Boolean, default: true },
      sellerNewOrders: { type: Boolean, default: true },
      sellerOrderStatus: { type: Boolean, default: true },
      sellerStockAlerts: { type: Boolean, default: true },
    },
    // Abonnements Web Push Navigateur / Mobile (PWA)
    pushSubscriptions: [
      {
        endpoint: { type: String, required: true },
        keys: {
          p256dh: { type: String, required: true },
          auth: { type: String, required: true },
        },
        deviceType: { type: String, default: 'browser' },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    // Liste des produits favoris suivis (pour alertes baisses de prix et promotions)
    favorites: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
      },
    ],
    // Sécurité : Tentatives infructueuses et verrouillage temporaire (Anti-Bruteforce)
    failedLoginAttempts: {
      type: Number,
      default: 0,
      select: false,
    },
    lockUntil: {
      type: Date,
      default: null,
      select: false,
    },
    // Sécurité : Réinitialisation de mot de passe par jeton temporaire haché
    passwordResetToken: {
      type: String,
      default: null,
      select: false,
    },
    passwordResetExpires: {
      type: Date,
      default: null,
      select: false,
    },
    // Sécurité : 2FA (Authentification à deux facteurs pour admin/vendeur)
    twoFactorEnabled: {
      type: Boolean,
      default: false,
    },
    twoFactorCode: {
      type: String,
      default: null,
      select: false,
    },
    twoFactorExpires: {
      type: Date,
      default: null,
      select: false,
    },
  },
  {
    timestamps: true,
  }
);

// Hachage automatique du mot de passe avant enregistrement si modifié
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    return next();
  }

  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Méthode personnalisée pour comparer le mot de passe lors de la connexion
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Vérifie si le compte est actuellement verrouillé à cause d'échecs répétés
userSchema.methods.isLocked = function () {
  return !!(this.lockUntil && this.lockUntil > Date.now());
};

// Génère un jeton temporaire cryptographique pour la réinitialisation de mot de passe
userSchema.methods.createPasswordResetToken = function () {
  const resetToken = generateRandomToken(32);
  this.passwordResetToken = hashToken(resetToken);
  this.passwordResetExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
  return resetToken;
};

export const User = mongoose.model('User', userSchema);
