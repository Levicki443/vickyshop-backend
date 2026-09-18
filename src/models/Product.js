import mongoose from 'mongoose';

/**
 * Schéma Mongoose pour les Produits de Vicky-Shop.
 * Inclut validation stricte, indexation pour les recherches et les catégories.
 */
const productSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Le titre du produit est obligatoire'],
      trim: true,
      maxlength: [150, 'Le titre ne peut pas dépasser 150 caractères'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [2000, 'La description ne peut pas dépasser 2000 caractères'],
      default: '',
    },
    price: {
      type: Number,
      required: [true, 'Le prix est obligatoire'],
      min: [0, 'Le prix ne peut pas être négatif'],
    },
    originalPrice: {
      type: Number,
      min: [0, 'Le prix d\'origine ne peut pas être négatif'],
      default: null,
    },
    category: {
      type: String,
      required: [true, 'La catégorie est obligatoire'],
      enum: ['vetements', 'chapeaux', 'hightech', 'accessoires', 'mode', 'tech', 'flash'],
      lowercase: true,
      trim: true,
    },
    image: {
      type: String,
      required: [true, 'L\'URL de l\'image est obligatoire'],
      trim: true,
    },
    badge: {
      type: String,
      enum: ['Nouveau', 'Promo', 'Vente Flash', 'Populaire', null],
      default: null,
    },
    rating: {
      type: Number,
      min: [0, 'La note minimale est 0'],
      max: [5, 'La note maximale est 5'],
      default: 5.0,
    },
    reviewsCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    inStock: {
      type: Boolean,
      default: true,
    },
    stockQuantity: {
      type: Number,
      default: 10,
      min: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Indexation pour optimiser la recherche par catégorie et les requêtes fréquentes
productSchema.index({ category: 1, price: 1 });
productSchema.index({ title: 'text', description: 'text' });

export const Product = mongoose.model('Product', productSchema);
