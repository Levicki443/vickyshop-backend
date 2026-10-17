import { Review } from '../models/Review.js';
import { Order } from '../models/Order.js';
import { Product } from '../models/Product.js';
import { sanitizeNoSqlValue } from '../middlewares/noSqlSanitizeMiddleware.js';

/**
 * Contrôleur public et client pour les Témoignages et Avis clients.
 * Gère la consultation, l'ajout restreint aux commandes livrées, et l'éligibilité.
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

// 2. Créer un nouvel avis client (Strictement réservé aux clients ayant commandé ET reçu l'article)
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

    let authorName = req.user ? req.user.name : (customerName || '').trim();
    if (!authorName) authorName = 'Client Vérifié';

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

    let isVerifiedPurchase = false;
    let orderRef = null;
    let cleanOrderNumber = (orderNumber || '').trim().toUpperCase();

    // RÈGLE STRICTE : Pour donner son avis sur un article, le client DOIT avoir commandé et REÇU l'article (statut: livree)
    if (productId) {
      let deliveredOrder = null;

      if (cleanOrderNumber) {
        const order = await Order.findOne({ orderNumber: cleanOrderNumber });
        if (order && order.orderStatus === 'livree') {
          const hasItem = order.items.some(
            (item) => String(item.productId) === String(productId) || item.title === productTitle
          );
          if (hasItem) deliveredOrder = order;
        }
      }

      if (!deliveredOrder && req.user) {
        const userDeliveredOrders = await Order.find({
          $or: [{ customerId: req.user._id }, { customerEmail: req.user.email }],
          orderStatus: 'livree',
        });

        deliveredOrder = userDeliveredOrders.find((ord) =>
          ord.items.some(
            (item) => String(item.productId) === String(productId) || item.title === productTitle
          )
        );
      }

      if (!deliveredOrder) {
        return res.status(403).json({
          status: 'error',
          message: 'Seuls les clients ayant commandé et reçu cet article (statut : Livrée) peuvent déposer un avis.',
        });
      }

      isVerifiedPurchase = true;
      orderRef = deliveredOrder._id;
      cleanOrderNumber = deliveredOrder.orderNumber;
    }

    // Protection anti-doublon
    const duplicateQuery = {
      comment: cleanComment,
      rating: numRating,
    };
    if (req.user) duplicateQuery.userId = req.user._id;
    if (cleanOrderNumber) duplicateQuery.orderNumber = cleanOrderNumber;
    if (productRef) duplicateQuery.productId = productRef;

    const existingReview = await Review.findOne(duplicateQuery);
    if (existingReview) {
      return res.status(409).json({
        status: 'error',
        message: 'Vous avez déjà soumis un avis identique. Merci pour votre retour !',
      });
    }

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
      status: 'pending',
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

// 4. Vérifier l'éligibilité d'un client à évaluer un article (Achat réel + Livraison reçue obligatoire)
export const checkReviewEligibility = async (req, res, next) => {
  try {
    const { productId } = req.params;
    if (!productId) {
      return res.status(400).json({
        status: 'error',
        message: 'Identifiant du produit manquant.',
      });
    }

    if (!req.user) {
      return res.status(200).json({
        status: 'success',
        data: {
          eligible: false,
          reason: 'unauthenticated',
          message: 'Connectez-vous pour évaluer cet article si vous l\'avez commandé et reçu.',
        },
      });
    }

    const orders = await Order.find({
      $or: [{ customerId: req.user._id }, { customerEmail: req.user.email }],
      'items.productId': productId,
    }).sort({ createdAt: -1 }).lean();

    if (!orders || orders.length === 0) {
      return res.status(200).json({
        status: 'success',
        data: {
          eligible: false,
          reason: 'not_ordered',
          message: 'Seuls les clients ayant commandé et reçu cet article peuvent laisser un avis.',
        },
      });
    }

    const deliveredOrder = orders.find((ord) => ord.orderStatus === 'livree');
    if (!deliveredOrder) {
      const activeOrder = orders[0];
      return res.status(200).json({
        status: 'success',
        data: {
          eligible: false,
          reason: 'not_delivered',
          orderNumber: activeOrder.orderNumber,
          orderStatus: activeOrder.orderStatus,
          message: `Votre commande #${activeOrder.orderNumber} n'a pas encore été livrée. Vous pourrez donner votre avis dès réception de votre colis !`,
        },
      });
    }

    const existingReview = await Review.findOne({
      userId: req.user._id,
      productId,
    }).lean();

    return res.status(200).json({
      status: 'success',
      data: {
        eligible: true,
        reason: 'eligible',
        alreadyReviewed: !!existingReview,
        orderNumber: deliveredOrder.orderNumber,
        message: existingReview
          ? 'Vous avez déjà évalué cet article suite à votre livraison.'
          : 'Achat vérifié et livré ! Vous pouvez déposer votre avis sur cet article.',
      },
    });
  } catch (error) {
    next(error);
  }
};
