import { Router } from 'express';
import {
  createOrder,
  getOrderByNumber,
} from '../controllers/orderController.js';

const router = Router();

router.route('/')
  .post(createOrder);

router.route('/:orderNumber')
  .get(getOrderByNumber);

export default router;
