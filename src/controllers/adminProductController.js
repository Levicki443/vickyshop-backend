import { Product } from '../models/Product.js';
import {
  notifyProductCreated,
  notifyProductUpdated,
  notifyProductDeleted,
  notifyProductStock,
} from '../config/socket.js';
import { uploadBufferToCloudinary } from '../services/cloudinaryService.js';
import { securityLog } from '../utils/securityLogger.js';
import { sanitizeText } from '../utils/xssSanitizer.js';

export const getAllProducts = async (req, res, next) => {
  try {
    const { category, search, stockStatus } = req.query;
    const query = { isArchived: { $ne: true } };

    if (category && category !== 'all') {
      query.category = category.toLowerCase().trim();
    }

    if (stockStatus === 'low') {
      query.stockQuantity = { $gt: 0, $lte: 5 };
    } else if (stockStatus === 'out') {
      query.$or = [{ inStock: false }, { stockQuantity: { $lte: 0 } }];
    } else if (stockStatus === 'in') {
      query.inStock = true;
      query.stockQuantity = { $gt: 0 };
    }

    if (search && typeof search === 'string' && search.trim()) {
      const sanitized = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const searchRegex = new RegExp(sanitized, 'i');
      query.$or = [{ title: searchRegex }, { description: searchRegex }, { brand: searchRegex }];
    }

    const products = await Product.find(query).sort({ createdAt: -1 }).lean();

    res.status(200).json({
      status: 'success',
      results: products.length,
      data: { products },
    });
  } catch (error) {
    next(error);
  }
};

export const createProduct = async (req, res, next) => {
  try {
    const {
      title, description, price, originalPrice, category, image, images,
      colors, sizes, badge, inStock, stockQuantity, lowStockThreshold, featured,
    } = req.body;

    const qty = stockQuantity !== undefined ? Math.max(0, Number(stockQuantity)) : 10;
    const isAvailable = inStock !== undefined ? Boolean(inStock) && qty > 0 : qty > 0;

    const parseArray = (val) => {
      if (Array.isArray(val)) return val.map((s) => sanitizeText(String(s)));
      if (typeof val === 'string' && val.trim()) {
        return val.split(',').map((s) => sanitizeText(s.trim())).filter(Boolean);
      }
      return [];
    };

    const product = await Product.create({
      title: sanitizeText(title),
      description: description ? sanitizeText(description) : '',
      price: Math.max(0, Number(price) || 0),
      originalPrice: originalPrice ? Math.max(0, Number(originalPrice) || 0) : null,
      category: category ? sanitizeText(category.toLowerCase()) : 'vetements',
      image,
      images: Array.isArray(images) ? images : [],
      colors: parseArray(colors),
      sizes: parseArray(sizes),
      badge: badge ? sanitizeText(badge) : null,
      inStock: isAvailable,
      stockQuantity: qty,
      lowStockThreshold: lowStockThreshold ? Math.max(1, Number(lowStockThreshold)) : 5,
      featured: Boolean(featured),
      seller: req.user._id,
      sellerName: 'Vicky-Shop Officiel',
    });

    try {
      notifyProductCreated(product);
    } catch (socketErr) {}

    securityLog.adminAction({
      action: 'CREATION_PRODUIT',
      targetResource: 'Product',
      userId: req.user._id,
      details: { productId: product._id, title: product.title },
      ip: req.ip,
    });

    res.status(201).json({
      status: 'success',
      message: 'Produit ajouté avec succès.',
      data: { product },
    });
  } catch (error) {
    next(error);
  }
};

export const updateProduct = async (req, res, next) => {
  try {
    const { id } = req.params;
    const allowedFields = [
      'title', 'description', 'price', 'originalPrice', 'category', 'subCategory',
      'brand', 'reference', 'image', 'images', 'colors', 'sizes', 'stockQuantity',
      'lowStockThreshold', 'badge', 'featured', 'isActive',
    ];

    const updates = {};
    for (const key of allowedFields) {
      if (req.body[key] !== undefined) {
        if (typeof req.body[key] === 'string') {
          updates[key] = sanitizeText(req.body[key]);
        } else {
          updates[key] = req.body[key];
        }
      }
    }

    if (updates.category) updates.category = updates.category.toLowerCase().trim();
    if (updates.price !== undefined) updates.price = Math.max(0, Number(updates.price) || 0);
    if (updates.stockQuantity !== undefined) {
      updates.stockQuantity = Math.max(0, Number(updates.stockQuantity));
      updates.inStock = updates.stockQuantity > 0;
    }

    const product = await Product.findByIdAndUpdate(id, { $set: updates }, { new: true, runValidators: true });

    if (!product) {
      return res.status(404).json({ status: 'error', message: 'Produit introuvable.' });
    }

    try {
      notifyProductUpdated(product);
      notifyProductStock(product._id, product.stockQuantity, product.inStock);
    } catch (socketErr) {}

    res.status(200).json({
      status: 'success',
      message: 'Produit mis à jour avec succès.',
      data: { product },
    });
  } catch (error) {
    next(error);
  }
};

export const deleteProduct = async (req, res, next) => {
  try {
    const { id } = req.params;
    const product = await Product.findByIdAndUpdate(
      id,
      { $set: { isArchived: true, isActive: false, inStock: false } },
      { new: true }
    );

    if (!product) {
      return res.status(404).json({ status: 'error', message: 'Produit introuvable.' });
    }

    try {
      notifyProductDeleted(id);
    } catch (socketErr) {}

    securityLog.adminAction({
      action: 'ARCHIVAGE_SUPPRESSION_PRODUIT',
      targetResource: 'Product',
      userId: req.user._id,
      details: { productId: id },
      ip: req.ip,
    });

    res.status(200).json({
      status: 'success',
      message: 'Produit retiré du catalogue avec succès.',
    });
  } catch (error) {
    next(error);
  }
};

export const toggleProductStock = async (req, res, next) => {
  try {
    const { id } = req.params;
    const product = await Product.findById(id);

    if (!product) {
      return res.status(404).json({ status: 'error', message: 'Produit introuvable.' });
    }

    product.inStock = !product.inStock;
    product.stockQuantity = product.inStock ? (product.stockQuantity > 0 ? product.stockQuantity : 5) : 0;
    await product.save();

    try {
      notifyProductUpdated(product);
      notifyProductStock(product._id, product.stockQuantity, product.inStock);
    } catch (socketErr) {}

    res.status(200).json({
      status: 'success',
      message: `Statut de stock mis à jour (${product.inStock ? 'En stock' : 'Rupture'}).`,
      data: { product },
    });
  } catch (error) {
    next(error);
  }
};

export const uploadProductImage = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ status: 'error', message: 'Aucun fichier image fourni.' });
    }

    const result = await uploadBufferToCloudinary(req.file.buffer, req.file.originalname, 'products');

    res.status(200).json({
      status: 'success',
      message: 'Image téléversée avec succès.',
      data: {
        url: result.secure_url,
        secure_url: result.secure_url,
        public_id: result.public_id,
        width: result.width,
        height: result.height,
        format: result.format,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const uploadMultipleProductImages = async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ status: 'error', message: 'Aucun fichier image fourni.' });
    }

    const uploadPromises = req.files.map((file) =>
      uploadBufferToCloudinary(file.buffer, file.originalname, 'products')
    );
    const results = await Promise.all(uploadPromises);

    res.status(200).json({
      status: 'success',
      message: `${results.length} images téléversées avec succès.`,
      data: {
        images: results.map((r) => r.secure_url),
        details: results,
      },
    });
  } catch (error) {
    next(error);
  }
};
