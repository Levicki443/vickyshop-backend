import mongoose from 'mongoose';

/**
 * Schéma Mongoose pour les Produits du catalogue Vicky-Shop / Marketplace.
 * Inclut la liaison au vendeur (seller), marque, référence, sous-catégorie,
 * statut actif/inactif, variantes et alertes de rupture de stock.
 */
const productSchema = new mongoose.Schema(
  {
    seller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    sellerName: {
      type: String,
      trim: true,
      default: 'Vicky-Shop Officiel',
    },
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
    subCategory: {
      type: String,
      trim: true,
      default: '',
    },
    brand: {
      type: String,
      trim: true,
      default: 'Générique',
    },
    reference: {
      type: String,
      trim: true,
      default: '',
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
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    isArchived: {
      type: Boolean,
      default: false,
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

// Virtual indiquant si le produit est presque en rupture de stock
productSchema.virtual('isLowStock').get(function () {
  return this.stockQuantity > 0 && this.stockQuantity <= (this.lowStockThreshold || 5);
});

// Virtual calculant le pourcentage de remise
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
  } else {
    this.inStock = true;
  }
  next();
});

// Indexation optimisée
productSchema.index({ seller: 1, isArchived: 1, createdAt: -1 });
productSchema.index({ category: 1, price: 1, inStock: 1, isActive: 1 });
productSchema.index({ title: 'text', description: 'text', reference: 'text', brand: 'text' });

export const Product = mongoose.model('Product', productSchema);
