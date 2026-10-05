import { Router } from 'express';
import {
  register,
  registerAdmin,
  login,
  getMe,
  updateProfile,
  updatePassword,
  upgradeUserToSeller,
} from '../controllers/authController.js';
import { forgotPassword, resetPassword } from '../controllers/passwordResetController.js';
import { protect } from '../middlewares/authMiddleware.js';
import {
  authLimiter,
  adminRegisterLimiter,
  passwordResetLimiter,
} from '../middlewares/rateLimitMiddleware.js';

const router = Router();

// Routes publiques d'authentification protégées par des limiteurs de débit
router.post('/register', authLimiter, register);
router.post('/register-admin', adminRegisterLimiter, registerAdmin);
router.post('/login', authLimiter, login);

// Routes de réinitialisation sécurisée de mot de passe
router.post('/forgot-password', passwordResetLimiter, forgotPassword);
router.post('/reset-password', passwordResetLimiter, resetPassword);

// Routes privées du profil utilisateur connecté
router.get('/me', protect, getMe);
router.patch('/update-profile', protect, updateProfile);
router.post('/upgrade-seller', protect, upgradeUserToSeller);
router.patch('/update-password', protect, updatePassword);

export default router;
