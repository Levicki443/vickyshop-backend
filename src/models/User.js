import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { ROLES, ALL_ROLES, normalizeRole } from '../utils/roleUtils.js';

/**
 * Schéma Mongoose pour les Utilisateurs de Vicky-Shop (Clients, Vendeurs, Administrateurs).
 * Gère l'authentification sécurisée, le hachage des mots de passe, le profil personnel
 * et les informations de boutique pour les vendeurs de la marketplace.
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
      minlength: [6, 'Le mot de passe doit comporter au moins 6 caractères'],
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
    },
    city: {
      type: String,
      trim: true,
      default: 'Abidjan',
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

export const User = mongoose.model('User', userSchema);
