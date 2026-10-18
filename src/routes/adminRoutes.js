import express from 'express';
import { protect, requireAdmin } from '../middlewares/authMiddleware.js';
import { uploadSingleImage, uploadMultipleImages } from '../middlewares/uploadMiddleware.js';
import { getDashboardKPIs } from '../controllers/adminKPIController.js';
import { getAllOrders, updateOrderStatus } from '../controllers/adminOrderController.js';
import {
  getAllProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  toggleProductStock,
  uploadProductImage,
  uploadMultipleProductImages,
  seedProductsAdmin,
} from '../controllers/adminProductController.js';
import {
  getShopSettings,
  updateShopSettings,
} from '../controllers/adminSettingsController.js';
import {
  getUserStats,
  getUsers,
  getUserById,
  updateUser,
  updateUserStatus,
  deleteUser,
} from '../controllers/adminUserController.js';

const router = express.Router();

// Toutes les routes d'administration sont strictement protégées par JWT et rôle Admin
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
router.post('/products/seed', seedProductsAdmin);
router.put('/products/:id', updateProduct);
router.delete('/products/:id', deleteProduct);
router.patch('/products/:id/toggle-stock', toggleProductStock);

// 5. Gestion avancée des utilisateurs & permissions
router.get('/users/stats', getUserStats);
router.get('/users', getUsers);
router.get('/users/:id', getUserById);
router.put('/users/:id', updateUser);
router.patch('/users/:id/status', updateUserStatus);
router.delete('/users/:id', deleteUser);

// 6. Paramètres généraux de la boutique
router.get('/settings', getShopSettings);
router.put('/settings', updateShopSettings);

export default router;
