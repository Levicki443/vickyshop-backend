import { Router } from 'express';
import {
  getProducts,
  getProductById,
  createProduct,
} from '../controllers/productController.js';
import { sanitizeSearchParams } from '../middlewares/validationMiddleware.js';

const router = Router();

router.route('/')
  .get(sanitizeSearchParams, getProducts)
  .post(createProduct);

router.route('/:id')
  .get(getProductById);

export default router;
