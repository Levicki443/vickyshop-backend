import express from 'express';
import { protect, requireAdmin } from '../middlewares/authMiddleware.js';
import { uploadSingleImage, uploadMultipleImages } from '../middlewares/uploadMiddleware.js';
import {
  getDashboardKPIs,
  getAllOrders,
  updateOrderStatus,
  getAllProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  toggleProductStock,
  uploadProductImage,
  uploadMultipleProductImages,
  getAllUsers,
  getShopSettings,
  updateShopSettings,
} from '../controllers/adminController.js';

const router = express.Router();

// Toutes les routes sous ce routeur sont strictement reservees au role admin
router.use(protect, requireAdmin);

// 1. Indicateurs de performance & finances
router.get('/kpis', getDashboardKPIs);

// 2. Gestion des commandes
router.get('/orders', getAllOrders);
router.patch('/orders/:id/status', updateOrderStatus);

// 3. Téléversement d'images sur Cloudinary
router.post('/upload', uploadSingleImage, uploadProductImage);
router.post('/upload-multiple', uploadMultipleImages, uploadMultipleProductImages);

// 4. Gestion du catalogue produits
router.get('/products', getAllProducts);
router.post('/products', createProduct);
router.put('/products/:id', updateProduct);
router.delete('/products/:id', deleteProduct);
router.patch('/products/:id/toggle-stock', toggleProductStock);

// 4. Gestion des utilisateurs / clients
router.get('/users', getAllUsers);

// 5. Parametres generaux de la boutique
router.get('/settings', getShopSettings);
router.put('/settings', updateShopSettings);

export default router;
