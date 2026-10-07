import mongoose from 'mongoose';

/**
 * Schéma Mongoose pour les Avis & Témoignages Clients de Vicky-Shop.
 * Supporte la modération dynamique, les notes de 1 à 5 étoiles,
 * la liaison facultative à un produit/commande et le badge "Achat vérifié".
 */
const reviewSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    customerName: {
      type: String,
      required: [true, 'Le nom du client est obligatoire'],
      trim: true,
      maxlength: [100, 'Le nom ne peut pas dépasser 100 caractères'],
    },
    customerAvatar: {
      type: String,
      default: '',
      trim: true,
    },
    rating: {
      type: Number,
      required: [true, 'La note en étoiles (1 à 5) est obligatoire'],
      min: [1, 'La note minimale est de 1 étoile'],
      max: [5, 'La note maximale est de 5 étoiles'],
      validate: {
        validator: Number.isInteger,
        message: 'La note doit être un nombre entier entre 1 et 5',
      },
    },
    comment: {
      type: String,
      required: [true, 'Le commentaire de votre avis est obligatoire'],
      trim: true,
      minlength: [5, 'Le commentaire doit contenir au moins 5 caractères'],
      maxlength: [1200, 'Le commentaire ne peut pas dépasser 1200 caractères'],
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      default: null,
      index: true,
    },
    productTitle: {
      type: String,
      default: '',
      trim: true,
    },
    productImage: {
      type: String,
      default: '',
      trim: true,
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      default: null,
      index: true,
    },
    orderNumber: {
      type: String,
      default: '',
      trim: true,
      index: true,
    },
    isVerifiedPurchase: {
      type: Boolean,
      default: false,
      index: true,
    },
    status: {
      type: String,
      enum: {
        values: ['pending', 'approved', 'rejected'],
        message: 'Statut invalide (pending, approved, rejected)',
      },
      default: 'pending',
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    adminReply: {
      type: String,
      default: '',
      trim: true,
      maxlength: [1000, 'La réponse administrateur ne peut pas dépasser 1000 caractères'],
    },
    adminReplyDate: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Index composé pour optimiser les requêtes d'affichage public (statut approuvé + actif + tri par date)
reviewSchema.index({ status: 1, isActive: 1, createdAt: -1 });
reviewSchema.index({ productId: 1, status: 1, isActive: 1 });

/**
 * Méthode statique pour obtenir les statistiques globales des avis publiés
 */
reviewSchema.statics.getPublicStats = async function (productId = null) {
  const matchStage = { status: 'approved', isActive: true };
  if (productId) {
    matchStage.productId = new mongoose.Types.ObjectId(productId);
  }

  const stats = await this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        totalReviews: { $sum: 1 },
        averageRating: { $avg: '$rating' },
        fiveStars: { $sum: { $cond: [{ $eq: ['$rating', 5] }, 1, 0] } },
        fourStars: { $sum: { $cond: [{ $eq: ['$rating', 4] }, 1, 0] } },
        threeStars: { $sum: { $cond: [{ $eq: ['$rating', 3] }, 1, 0] } },
        twoStars: { $sum: { $cond: [{ $eq: ['$rating', 2] }, 1, 0] } },
        oneStar: { $sum: { $cond: [{ $eq: ['$rating', 1] }, 1, 0] } },
      },
    },
  ]);

  if (!stats || stats.length === 0) {
    return {
      totalReviews: 0,
      averageRating: 5.0,
      fiveStars: 0,
      fourStars: 0,
      threeStars: 0,
      twoStars: 0,
      oneStar: 0,
    };
  }

  return {
    totalReviews: stats[0].totalReviews,
    averageRating: Math.round(stats[0].averageRating * 10) / 10,
    fiveStars: stats[0].fiveStars,
    fourStars: stats[0].fourStars,
    threeStars: stats[0].threeStars,
    twoStars: stats[0].twoStars,
    oneStar: stats[0].oneStar,
  };
};

export const Review = mongoose.model('Review', reviewSchema);
export default Review;
