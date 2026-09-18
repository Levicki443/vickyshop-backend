import { Product } from '../models/Product.js';

/**
 * Récupère tous les produits avec filtres optionnels (catégorie, recherche, tri, pagination).
 */
export const getProducts = async (req, res, next) => {
  try {
    const { category, search, sort, page = 1, limit = 20 } = req.query;

    const filter = {};
    if (category && category !== 'all') {
      filter.category = category.toLowerCase();
    }
    if (search) {
      filter.title = { $regex: search, $options: 'i' };
    }

    let query = Product.find(filter);

    // Options de tri
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
 * Récupère un produit spécifique par son identifiant.
 */
export const getProductById = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({
        status: 'error',
        message: 'Produit introuvable.',
      });
    }

    res.status(200).json({
      status: 'success',
      data: { product },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Crée un nouveau produit (réservé aux administrateurs).
 */
export const createProduct = async (req, res, next) => {
  try {
    const newProduct = await Product.create(req.body);
    res.status(201).json({
      status: 'success',
      data: { product: newProduct },
    });
  } catch (error) {
    next(error);
  }
};
