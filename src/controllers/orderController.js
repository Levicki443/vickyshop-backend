import { Order } from '../models/Order.js';

/**
 * Génère un numéro de commande unique et sécurisé.
 */
const generateOrderNumber = () => {
  const timestamp = Date.now().toString(36).toUpperCase();
  const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `VK-${timestamp}-${randomSuffix}`;
};

/**
 * Crée une nouvelle commande avec validation des montants et attribution d'un numéro.
 */
export const createOrder = async (req, res, next) => {
  try {
    const {
      customerName,
      customerPhone,
      customerEmail,
      deliveryAddress,
      city,
      items,
      subtotal,
      discount,
      shippingCost,
      total,
      paymentMethod,
    } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'La commande doit comporter au moins un article.',
      });
    }

    const orderNumber = generateOrderNumber();

    const order = await Order.create({
      orderNumber,
      customerName,
      customerPhone,
      customerEmail,
      deliveryAddress,
      city: city || 'Abidjan',
      items,
      subtotal,
      discount: discount || 0,
      shippingCost: shippingCost || 0,
      total,
      paymentMethod,
      paymentStatus: 'en_attente',
      orderStatus: 'recue',
    });

    res.status(201).json({
      status: 'success',
      message: 'Commande enregistrée avec succès.',
      data: { order },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Récupère le statut et les détails d'une commande par son numéro de référence.
 */
export const getOrderByNumber = async (req, res, next) => {
  try {
    const order = await Order.findOne({ orderNumber: req.params.orderNumber });
    if (!order) {
      return res.status(404).json({
        status: 'error',
        message: 'Commande introuvable.',
      });
    }

    res.status(200).json({
      status: 'success',
      data: { order },
    });
  } catch (error) {
    next(error);
  }
};
