import { Router } from 'express';
import {
  getProducts,
  getProductById,
  createProduct,
} from '../controllers/productController.js';

const router = Router();

router.route('/')
  .get(getProducts)
  .post(createProduct);

router.route('/:id')
  .get(getProductById);

export default router;
