import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

/**
 * Schéma Mongoose pour les Utilisateurs / Clients de Vicky-Shop.
 * Gère l'authentification sécurisée, le hachage des mots de passe et le profil de livraison.
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
      enum: ['customer', 'admin'],
      default: 'customer',
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
