import { Router } from 'express';
import { register, login, getMe } from '../controllers/authController.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = Router();

// Routes publiques d'authentification
router.post('/register', register);
router.post('/login', login);

// Route privée pour récupérer le profil utilisateur connecté
router.get('/me', protect, getMe);

export default router;
