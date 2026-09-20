import { Router } from 'express';
import { register, registerAdmin, login, getMe } from '../controllers/authController.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = Router();

// Routes publiques d'authentification
router.post('/register', register);
router.post('/register-admin', registerAdmin);
router.post('/login', login);

// Route privee pour recuperer le profil utilisateur connecte
router.get('/me', protect, getMe);

export default router;
