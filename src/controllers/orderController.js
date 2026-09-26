import { Order } from '../models/Order.js';
import { Product } from '../models/Product.js';
import { notifyAdmins } from '../config/socket.js';
import { sendOrderConfirmationEmail } from '../services/emailService.js';

/**
 * Génère un numéro de commande élégant et unique pour Vicky-Shop.
 * Format : VK-20260927-4X9P
 */
const generateOrderNumber = () => {
  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `VK-${dateStr}-${randomSuffix}`;
};

/**
 * Déduit le stock des produits commandés et bascule inStock si rupture.
 */
const deductProductsStock = async (items) => {
  if (!items || !Array.isArray(items)) return;

  for (const item of items) {
    try {
      let product = null;
      if (item.productId) {
        product = await Product.findById(item.productId);
      }
      if (!product && item.title) {
        product = await Product.findOne({ title: item.title });
      }

      if (product) {
        const newStock = Math.max(0, (product.stockQuantity || 0) - item.quantity);
        product.stockQuantity = newStock;
        if (newStock === 0) {
          product.inStock = false;
        }
        await product.save();
      }
    } catch (err) {
      console.error(`[Stock] Erreur mise à jour stock pour ${item.title} :`, err.message);
    }
  }
};

/**
 * Crée une nouvelle commande, met à jour les stocks, diffuse en temps réel via Socket.IO
 * et transmet l'email de confirmation via Brevo.
 */
export const createOrder = async (req, res, next) => {
  try {
    const {
      customerName,
      customerPhone,
      customerEmail,
      deliveryAddress,
      city,
      deliveryNotes,
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

    if (!customerName || !customerPhone || !deliveryAddress) {
      return res.status(400).json({
        status: 'error',
        message: 'Les informations du client (nom, téléphone, adresse de livraison) sont obligatoires.',
      });
    }

    const orderNumber = generateOrderNumber();

    const order = await Order.create({
      orderNumber,
      customerName,
      customerPhone,
      customerEmail: customerEmail ? customerEmail.toLowerCase().trim() : '',
      deliveryAddress,
      city: city || 'Abidjan',
      deliveryNotes: deliveryNotes || '',
      items,
      subtotal: Number(subtotal) || 0,
      discount: Number(discount) || 0,
      shippingCost: Number(shippingCost) || 0,
      total: Number(total) || 0,
      paymentMethod: paymentMethod || 'livraison',
      paymentStatus: 'en_attente',
      orderStatus: 'recue',
      statusHistory: [
        {
          status: 'recue',
          updatedAt: new Date(),
          comment: 'Commande passée avec succès par le client.',
        },
      ],
    });

    // 1. Déduction atomique du stock
    deductProductsStock(items).catch((err) =>
      console.error('[OrderController] Erreur déduction stock :', err)
    );

    // 2. Notification en temps réel vers le Dashboard Administrateur via Socket.IO
    try {
      notifyAdmins('order:new', order);
      console.log(`[Socket.IO] Notification 'order:new' émise pour #${order.orderNumber}`);
    } catch (socketErr) {
      console.warn('[Socket.IO] Impossible d\'émettre la notification :', socketErr.message);
    }

    // 3. Envoi de l'email de confirmation via Brevo (exécuté en tâche de fond)
    if (order.customerEmail) {
      sendOrderConfirmationEmail(order)
        .then((res) => {
          if (res.success) {
            console.log(`[Email] Mail de confirmation envoyé à ${order.customerEmail}`);
          }
        })
        .catch((emailErr) => {
          console.error('[Email] Échec envoi email Brevo :', emailErr.message);
        });
    }

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
