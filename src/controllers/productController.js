import mongoose from 'mongoose';
import { Product } from '../models/Product.js';
import { Order } from '../models/Order.js';
import { notifyProductCreated, notifyProductUpdated, notifyProductDeleted } from '../config/socket.js';
import { notifyNewProductPublished, notifyProductPriceDrop } from '../services/notificationService.js';
import { findSimilarProducts } from '../services/recommendationService.js';
import { isAdminRole, isSellerRole } from '../utils/roleUtils.js';

/**
 * Récupère tous les produits publics avec filtres optionnels.
 */
export const getProducts = async (req, res, next) => {
  try {
    const { category, search, sort, page = 1, limit = 50 } = req.query;

    const filter = { isArchived: { $ne: true } };
    if (category && category !== 'all') {
      filter.category = category.toLowerCase();
    }
    if (search) {
      filter.title = { $regex: search, $options: 'i' };
    }

    let query = Product.find(filter).populate('seller', 'name shopName isSellerActive').lean();

    if (sort === 'price-asc') {
      query = query.sort({ price: 1 });
    } else if (sort === 'price-desc') {
      query = query.sort({ price: -1 });
    } else if (sort === 'popular') {
      query = query.sort({ reviewsCount: -1 });
    } else {
      query = query.sort({ createdAt: -1 });
    }

    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    query = query.skip(skip).limit(parseInt(limit, 10));

    const [products, total] = await Promise.all([
      query.exec(),
      Product.countDocuments(filter),
    ]);

    res.set('Cache-Control', 'public, max-age=45, stale-while-revalidate=120');
    res.status(200).json({
      status: 'success',
      results: products.length,
      total,
      data: { products },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Récupère un produit spécifique par son identifiant ou son slug avec validation et masquage strict.
 */
export const getProductById = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id || typeof id !== 'string' || !id.trim()) {
      return res.status(404).json({
        status: 'error',
        message: 'Identifiant ou slug de produit manquant.',
      });
    }

    const cleanIdentifier = id.trim();
    const isObjectId = mongoose.Types.ObjectId.isValid(cleanIdentifier);

    const query = isObjectId
      ? { $or: [{ _id: cleanIdentifier }, { slug: cleanIdentifier.toLowerCase() }], isArchived: { $ne: true } }
      : { slug: cleanIdentifier.toLowerCase(), isArchived: { $ne: true } };

    const product = await Product.findOne(query).populate('seller', 'name shopName shopPhone isSellerActive').lean();
    if (!product) {
      return res.status(404).json({
        status: 'error',
        message: 'Produit introuvable ou retiré de la vente.',
      });
    }

    res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=180');
    res.status(200).json({
      status: 'success',
      data: { product },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Récupère exclusivement les produits appartenant au vendeur connecté (Isolation stricte).
 */
export const getMyProducts = async (req, res, next) => {
  try {
    const query = isAdminRole(req.user.role) ? { isArchived: { $ne: true } } : { seller: req.user._id, isArchived: { $ne: true } };
    const products = await Product.find(query).sort({ createdAt: -1 }).lean();

    res.set('Cache-Control', 'no-store, private');
    res.status(200).json({
      status: 'success',
      results: products.length,
      data: { products },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Crée un nouveau produit (associé au vendeur connecté ou admin) et alerte les clients.
 */
export const createProduct = async (req, res, next) => {
  try {
    const productData = {
      ...req.body,
      seller: req.user._id,
      sellerName: isSellerRole(req.user.role) ? (req.user.shopName || req.user.name) : 'Vicky-Shop Officiel',
    };

    const newProduct = await Product.create(productData);

    try {
      notifyProductCreated(newProduct);
      notifyNewProductPublished(newProduct).catch(() => {});
    } catch (sErr) {
      console.warn('[Socket.IO] Erreur notification création produit :', sErr.message);
    }

    res.status(201).json({
      status: 'success',
      message: 'Produit créé avec succès.',
      data: { product: newProduct },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Modifie un produit existant et alerte les clients en cas de baisse de prix.
 */
export const updateProduct = async (req, res, next) => {
  try {
    const allowedFields = [
      'title',
      'description',
      'price',
      'originalPrice',
      'category',
      'subCategory',
      'brand',
      'reference',
      'image',
      'images',
      'colors',
      'sizes',
      'stockQuantity',
      'lowStockThreshold',
      'badge',
      'featured',
      'isActive',
    ];

    const currentProduct = await Product.findById(req.params.id);
    if (!currentProduct) {
      return res.status(404).json({ status: 'error', message: 'Produit introuvable.' });
    }

    const previousPrice = currentProduct.price;

    const updates = {};
    for (const key of allowedFields) {
      if (req.body[key] !== undefined) {
        updates[key] = req.body[key];
      }
    }

    if (updates.stockQuantity !== undefined) {
      updates.inStock = Number(updates.stockQuantity) > 0;
    }

    const updatedProduct = await Product.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true, runValidators: true }
    );

    // Déclenchement de l'alerte baisse de prix si le prix a diminué
    if (updates.price !== undefined && Number(updates.price) < Number(previousPrice)) {
      notifyProductPriceDrop(updatedProduct, previousPrice, updates.price).catch(() => {});
    }

    try {
      notifyProductUpdated(updatedProduct);
    } catch (sErr) {
      console.warn('[Socket.IO] Erreur notification mise à jour produit :', sErr.message);
    }

    res.status(200).json({
      status: 'success',
      message: 'Produit mis à jour avec succès.',
      data: { product: updatedProduct },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Supprime ou archive intelligemment un produit.
 */
export const deleteProduct = async (req, res, next) => {
  try {
    const productId = req.params.id;
    const hasOrderHistory = await Order.exists({ 'items.productId': productId });

    if (hasOrderHistory) {
      const archived = await Product.findByIdAndUpdate(
        productId,
        { $set: { isArchived: true, isActive: false, inStock: false } },
        { new: true }
      );

      try {
        notifyProductDeleted(productId);
      } catch (sErr) {}

      return res.status(200).json({
        status: 'success',
        message: 'Ce produit étant lié à des commandes passées, il a été archivé et retiré de la vente pour préserver l\'historique.',
        data: { product: archived, isArchived: true },
      });
    }

    await Product.findByIdAndDelete(productId);

    try {
      notifyProductDeleted(productId);
    } catch (sErr) {
      console.warn('[Socket.IO] Erreur notification suppression produit :', sErr.message);
    }

    res.status(200).json({
      status: 'success',
      message: 'Produit supprimé définitivement de votre boutique.',
      data: { deleted: true },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Récupère des recommandations de produits similaires basées sur une correspondance intelligente :
 * Catégorie stricte, type sémantique exact, sous-catégorie, marque et proximité de prix.
 */
export const getSimilarProducts = async (req, res, next) => {
  try {
    const { id } = req.params;
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 4, 1), 12);

    if (!id || typeof id !== 'string' || !id.trim()) {
      return res.status(400).json({ status: 'error', message: 'Identifiant ou slug de produit requis.' });
    }

    const cleanIdentifier = id.trim();
    const isObjectId = mongoose.Types.ObjectId.isValid(cleanIdentifier);
    const query = isObjectId
      ? { $or: [{ _id: cleanIdentifier }, { slug: cleanIdentifier.toLowerCase() }], isArchived: { $ne: true } }
      : { slug: cleanIdentifier.toLowerCase(), isArchived: { $ne: true } };

    const currentProduct = await Product.findOne(query);
    if (!currentProduct) {
      return res.status(404).json({ status: 'error', message: 'Produit introuvable.' });
    }

    const products = await findSimilarProducts(currentProduct, limit);

    res.set('Cache-Control', 'public, max-age=120, stale-while-revalidate=300');
    res.status(200).json({
      status: 'success',
      results: products.length,
      data: { products },
    });
  } catch (error) {
    next(error);
  }
};

