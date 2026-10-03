import express from 'express';
import {
  getProducts,
  getProductById,
  getMyProducts,
  createProduct,
  updateProduct,
  deleteProduct,
} from '../controllers/productController.js';
import { protect, requireSeller, checkProductOwnership } from '../middlewares/authMiddleware.js';

const router = express.Router();

// Routes publiques
router.get('/', getProducts);
router.get('/my-products', protect, requireSeller, getMyProducts);
router.get('/:id', getProductById);

// Routes sécurisées Vendeurs / Admins avec vérification de propriété
router.post('/', protect, requireSeller, createProduct);
router.put('/:id', protect, requireSeller, checkProductOwnership, updateProduct);
router.delete('/:id', protect, requireSeller, checkProductOwnership, deleteProduct);

export default router;
