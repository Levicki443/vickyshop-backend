import { Router } from 'express';
import {
  register,
  registerAdmin,
  login,
  getMe,
  updateProfile,
  updatePassword,
} from '../controllers/authController.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = Router();

// Routes publiques d'authentification
router.post('/register', register);
router.post('/register-admin', registerAdmin);
router.post('/login', login);

// Routes privées du profil utilisateur connecté
router.get('/me', protect, getMe);
router.patch('/update-profile', protect, updateProfile);
router.patch('/update-password', protect, updatePassword);

export default router;
