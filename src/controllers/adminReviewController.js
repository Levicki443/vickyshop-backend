import { Review } from '../models/Review.js';
import { sanitizeNoSqlValue } from '../middlewares/noSqlSanitizeMiddleware.js';

/**
 * Contrôleur Administrateur pour la gestion et modération des avis et témoignages clients.
 * Permet la validation, le refus, la modification, la suppression et la consultation des KPIs d'avis.
 */

// 1. Lister tous les avis pour le Backoffice avec filtres & KPIs
export const getAllReviewsAdmin = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const { status, search, rating } = req.query;

    const filter = {};

    if (status && status !== 'all') {
      filter.status = sanitizeNoSqlValue(status);
    }

    if (rating && rating !== 'all') {
      const numRating = parseInt(rating, 10);
      if (numRating >= 1 && numRating <= 5) {
        filter.rating = numRating;
      }
    }

    if (search && search.trim()) {
      const cleanSearch = search.trim();
      filter.$or = [
        { customerName: { $regex: cleanSearch, $options: 'i' } },
        { comment: { $regex: cleanSearch, $options: 'i' } },
        { productTitle: { $regex: cleanSearch, $options: 'i' } },
        { orderNumber: { $regex: cleanSearch, $options: 'i' } },
      ];
    }

    // Récupération simultanée de la liste et des compteurs globaux
    const [reviews, totalCount, pendingCount, approvedCount, rejectedCount, globalStats] = await Promise.all([
      Review.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Review.countDocuments(filter),
      Review.countDocuments({ status: 'pending' }),
      Review.countDocuments({ status: 'approved' }),
      Review.countDocuments({ status: 'rejected' }),
      Review.getPublicStats(),
    ]);

    res.status(200).json({
      status: 'success',
      data: {
        reviews,
        kpis: {
          totalReviews: pendingCount + approvedCount + rejectedCount,
          pendingReviews: pendingCount,
          approvedReviews: approvedCount,
          rejectedReviews: rejectedCount,
          averageRating: globalStats.averageRating || 5.0,
        },
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalCount / limit) || 1,
          totalCount,
          hasMore: skip + reviews.length < totalCount,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

// 2. Mettre à jour le statut de modération d'un avis (Approuver / Rejeter / Remettre en attente)
export const updateReviewStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['pending', 'approved', 'rejected'].includes(status)) {
      return res.status(400).json({
        status: 'error',
        message: 'Statut de modération invalide (pending, approved, rejected requis).',
      });
    }

    const review = await Review.findByIdAndUpdate(
      id,
      { status },
      { new: true, runValidators: true }
    );

    if (!review) {
      return res.status(404).json({
        status: 'error',
        message: 'Témoignage introuvable.',
      });
    }

    const statusLabels = {
      approved: 'validé et publié',
      rejected: 'refusé',
      pending: 'remis en attente',
    };

    res.status(200).json({
      status: 'success',
      message: `Le témoignage a été ${statusLabels[status]} avec succès.`,
      data: { review },
    });
  } catch (error) {
    next(error);
  }
};

// 3. Basculer la visibilité active/masquée d'un avis
export const toggleReviewActive = async (req, res, next) => {
  try {
    const { id } = req.params;
    const review = await Review.findById(id);

    if (!review) {
      return res.status(404).json({
        status: 'error',
        message: 'Témoignage introuvable.',
      });
    }

    review.isActive = !review.isActive;
    await review.save();

    res.status(200).json({
      status: 'success',
      message: `Le témoignage est désormais ${review.isActive ? 'visible' : 'masqué'}.`,
      data: { review },
    });
  } catch (error) {
    next(error);
  }
};

// 4. Modifier les informations d'un avis ou ajouter une réponse administrateur
export const updateReviewAdmin = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { customerName, rating, comment, adminReply, isVerifiedPurchase } = req.body;

    const updates = {};
    if (customerName) updates.customerName = customerName.trim();
    if (rating) updates.rating = Math.min(5, Math.max(1, parseInt(rating, 10)));
    if (comment) updates.comment = comment.trim();
    if (typeof isVerifiedPurchase === 'boolean') updates.isVerifiedPurchase = isVerifiedPurchase;
    if (typeof adminReply === 'string') {
      updates.adminReply = adminReply.trim();
      updates.adminReplyDate = new Date();
    }

    const review = await Review.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    });

    if (!review) {
      return res.status(404).json({
        status: 'error',
        message: 'Témoignage introuvable.',
      });
    }

    res.status(200).json({
      status: 'success',
      message: 'Témoignage mis à jour avec succès.',
      data: { review },
    });
  } catch (error) {
    next(error);
  }
};

// 5. Supprimer définitivement un avis
export const deleteReviewAdmin = async (req, res, next) => {
  try {
    const { id } = req.params;
    const review = await Review.findByIdAndDelete(id);

    if (!review) {
      return res.status(404).json({
        status: 'error',
        message: 'Témoignage introuvable.',
      });
    }

    res.status(200).json({
      status: 'success',
      message: 'Le témoignage a été supprimé définitivement.',
      data: { id },
    });
  } catch (error) {
    next(error);
  }
};
