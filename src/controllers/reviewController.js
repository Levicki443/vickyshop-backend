import { Review } from '../models/Review.js';
import { Order } from '../models/Order.js';
import { Product } from '../models/Product.js';
import { sanitizeNoSqlValue } from '../middlewares/noSqlSanitizeMiddleware.js';

/**
 * Contrôleur public et client pour les Témoignages et Avis clients.
 * Gère la consultation, l'ajout avec détection d'achat vérifié, et la protection anti-spam.
 */

// 1. Récupérer les avis approuvés et actifs (Public)
export const getApprovedReviews = async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const skip = (page - 1) * limit;

    const { productId, sort = 'recent' } = req.query;

    const filter = { status: 'approved', isActive: true };
    if (productId) {
      filter.productId = sanitizeNoSqlValue(productId);
    }

    let sortCriteria = { createdAt: -1 };
    if (sort === 'highest') sortCriteria = { rating: -1, createdAt: -1 };
    if (sort === 'lowest') sortCriteria = { rating: 1, createdAt: -1 };

    const [reviews, totalCount, stats] = await Promise.all([
      Review.find(filter)
        .sort(sortCriteria)
        .skip(skip)
        .limit(limit)
        .lean(),
      Review.countDocuments(filter),
      Review.getPublicStats(productId || null),
    ]);

    res.status(200).json({
      status: 'success',
      data: {
        reviews,
        stats,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalCount / limit) || 1,
          totalReviews: totalCount,
          hasMore: skip + reviews.length < totalCount,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

// 2. Créer un nouvel avis client (Avec vérification automatique de commande réelle)
export const createReview = async (req, res, next) => {
  try {
    const {
      rating,
      comment,
      customerName,
      customerAvatar,
      productId,
      orderNumber,
    } = req.body;

    // Validation des données d'entrée
    const numRating = parseInt(rating, 10);
    if (!numRating || numRating < 1 || numRating > 5) {
      return res.status(400).json({
        status: 'error',
        message: 'La note doit être un entier compris entre 1 et 5 étoiles.',
      });
    }

    const cleanComment = typeof comment === 'string' ? comment.trim() : '';
    if (!cleanComment || cleanComment.length < 5) {
      return res.status(400).json({
        status: 'error',
        message: 'Le commentaire doit comporter au moins 5 caractères.',
      });
    }
    if (cleanComment.length > 1200) {
      return res.status(400).json({
        status: 'error',
        message: 'Le commentaire ne peut pas dépasser 1200 caractères.',
      });
    }

    // Détermination du nom du client (depuis la session ou le formulaire)
    let authorName = req.user ? req.user.name : (customerName || '').trim();
    if (!authorName) {
      authorName = 'Client Vérifié';
    }

    // Avatar par défaut si non spécifié
    let authorAvatar = (customerAvatar || '').trim();
    if (!authorAvatar && req.user?.avatar) {
      authorAvatar = req.user.avatar;
    }

    let productRef = null;
    let productTitle = '';
    let productImage = '';

    if (productId) {
      const foundProduct = await Product.findById(productId).select('title image');
      if (foundProduct) {
        productRef = foundProduct._id;
        productTitle = foundProduct.title;
        productImage = foundProduct.image || '';
      }
    }

    // Vérification d'achat réel (Achat vérifié)
    let isVerifiedPurchase = false;
    let orderRef = null;
    let cleanOrderNumber = (orderNumber || '').trim().toUpperCase();

    if (cleanOrderNumber) {
      const order = await Order.findOne({ orderNumber: cleanOrderNumber });
      if (order) {
        orderRef = order._id;
        // Vérification de validité de la commande
        const isDeliveredOrValid = ['livree', 'en_livraison', 'confirmee', 'en_preparation'].includes(order.orderStatus);
        if (isDeliveredOrValid) {
          if (!productId) {
            isVerifiedPurchase = true;
          } else {
            const hasPurchasedProduct = order.items.some(
              (item) => String(item.productId) === String(productId) || item.title === productTitle
            );
            if (hasPurchasedProduct) {
              isVerifiedPurchase = true;
            }
          }
        }
      }
    } else if (req.user) {
      // Vérifier si le client connecté a une commande livrée pour ce produit
      const userOrders = await Order.find({
        $or: [{ customerId: req.user._id }, { customerEmail: req.user.email }],
      });

      if (userOrders.length > 0) {
        if (!productId) {
          isVerifiedPurchase = true;
        } else {
          const matchingOrder = userOrders.find((ord) =>
            ord.items.some((item) => String(item.productId) === String(productId))
          );
          if (matchingOrder) {
            isVerifiedPurchase = true;
            orderRef = matchingOrder._id;
            cleanOrderNumber = matchingOrder.orderNumber;
          }
        }
      }
    }

    // Protection anti-doublon (éviter de poster plusieurs fois le même avis)
    const duplicateQuery = {
      comment: cleanComment,
      rating: numRating,
    };
    if (req.user) duplicateQuery.userId = req.user._id;
    if (cleanOrderNumber) duplicateQuery.orderNumber = cleanOrderNumber;

    const existingReview = await Review.findOne(duplicateQuery);
    if (existingReview) {
      return res.status(409).json({
        status: 'error',
        message: 'Vous avez déjà soumis un avis identique. Merci pour votre retour !',
      });
    }

    // Création du témoignage en base de données
    const newReview = await Review.create({
      userId: req.user ? req.user._id : null,
      customerName: authorName,
      customerAvatar: authorAvatar,
      rating: numRating,
      comment: cleanComment,
      productId: productRef,
      productTitle,
      productImage,
      orderId: orderRef,
      orderNumber: cleanOrderNumber,
      isVerifiedPurchase,
      status: 'pending', // En attente de validation administrative (modération stricte)
      isActive: true,
    });

    res.status(201).json({
      status: 'success',
      message: 'Votre avis a été enregistré avec succès ! Il sera publié dès validation par notre équipe.',
      data: {
        review: newReview,
      },
    });
  } catch (error) {
    next(error);
  }
};

// 3. Récupérer les avis déposés par l'utilisateur connecté
export const getMyReviews = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        status: 'error',
        message: 'Vous devez être connecté pour consulter vos avis.',
      });
    }

    const reviews = await Review.find({ userId: req.user._id }).sort({ createdAt: -1 });

    res.status(200).json({
      status: 'success',
      data: {
        reviews,
      },
    });
  } catch (error) {
    next(error);
  }
};
