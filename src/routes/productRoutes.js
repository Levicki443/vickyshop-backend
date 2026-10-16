import express from 'express';
import {
  getProducts,
  getProductById,
  getSimilarProducts,
  getMyProducts,
  createProduct,
  updateProduct,
  deleteProduct,
} from '../controllers/productController.js';
import { getProductSharePreview } from '../controllers/sharePreviewController.js';
import { protect, requireSeller, checkProductOwnership } from '../middlewares/authMiddleware.js';

const router = express.Router();

// Routes publiques
router.get('/', getProducts);
router.get('/my-products', protect, requireSeller, getMyProducts);
router.get('/:identifier/preview', getProductSharePreview);
router.get('/share/:identifier', getProductSharePreview);
router.get('/:id/similar', getSimilarProducts);
router.get('/:id', getProductById);

// Routes sécurisées Vendeurs / Admins avec vérification de propriété
router.post('/', protect, requireSeller, createProduct);
router.put('/:id', protect, requireSeller, checkProductOwnership, updateProduct);
router.delete('/:id', protect, requireSeller, checkProductOwnership, deleteProduct);

export default router;
