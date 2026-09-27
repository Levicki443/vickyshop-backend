import mongoose from 'mongoose';

/**
 * Schéma Mongoose pour les Produits du catalogue Vicky-Shop.
 * Inclut la gestion avancée des stocks, des variantes (couleurs, tailles),
 * de la galerie Cloudinary et des alertes de rupture.
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
      maxlength: [3000, 'La description ne peut pas dépasser 3000 caractères'],
      default: '',
    },
    price: {
      type: Number,
      required: [true, 'Le prix de vente est obligatoire'],
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
      lowercase: true,
      trim: true,
      index: true,
    },
    image: {
      type: String,
      required: [true, 'L\'image principale du produit est obligatoire'],
      trim: true,
    },
    images: {
      type: [String],
      default: [],
    },
    colors: {
      type: [String],
      default: [],
    },
    sizes: {
      type: [String],
      default: [],
    },
    stockQuantity: {
      type: Number,
      required: [true, 'La quantité en stock est obligatoire'],
      default: 10,
      min: [0, 'Le stock ne peut pas être négatif'],
    },
    lowStockThreshold: {
      type: Number,
      default: 5,
      min: 1,
    },
    inStock: {
      type: Boolean,
      default: true,
      index: true,
    },
    badge: {
      type: String,
      enum: ['Nouveau', 'Promo', 'Vente Flash', 'Populaire', 'Coup de Cœur', null, ''],
      default: null,
    },
    featured: {
      type: Boolean,
      default: false,
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
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual indiquant si le produit est presque en rupture de stock (<= 5)
productSchema.virtual('isLowStock').get(function () {
  return this.stockQuantity > 0 && this.stockQuantity <= (this.lowStockThreshold || 5);
});

// Virtual calculant le pourcentage de remise si un prix d'origine est renseigné
productSchema.virtual('discountPercent').get(function () {
  if (this.originalPrice && this.originalPrice > this.price) {
    return Math.round(((this.originalPrice - this.price) / this.originalPrice) * 100);
  }
  return 0;
});

// Middleware pre-save pour synchroniser inStock avec stockQuantity
productSchema.pre('save', function (next) {
  if (this.stockQuantity <= 0) {
    this.inStock = false;
    this.stockQuantity = 0;
  }
  next();
});

// Indexation pour optimiser la recherche et le filtrage
productSchema.index({ category: 1, price: 1, inStock: 1 });
productSchema.index({ title: 'text', description: 'text' });

export const Product = mongoose.model('Product', productSchema);
