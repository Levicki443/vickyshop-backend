import { Router } from 'express';
import {
  createOrder,
  getOrderByNumber,
} from '../controllers/orderController.js';
import { validateOrderPayload } from '../middlewares/validationMiddleware.js';

const router = Router();

router.route('/')
  .post(validateOrderPayload, createOrder);

router.route('/:orderNumber')
  .get(getOrderByNumber);

export default router;
