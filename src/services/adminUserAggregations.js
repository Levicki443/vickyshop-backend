import { Order } from '../models/Order.js';
import { Product } from '../models/Product.js';

/**
 * Fonctions d'agrégation de commandes et de catalogue pour enrichir les fiches utilisateurs.
 * Découplées pour respecter la règle stricte de modularité (< 325 lignes par fichier).
 */

export const aggregateOrdersSummary = async (userIds) => {
  return await Order.aggregate([
    {
      $match: {
        customerId: { $in: userIds },
        orderStatus: { $ne: 'annulee' },
      },
    },
    {
      $group: {
        _id: '$customerId',
        ordersCount: { $sum: 1 },
        totalSpent: { $sum: '$total' },
      },
    },
  ]);
};

export const aggregateProductsSummary = async (userIds) => {
  return await Product.aggregate([
    {
      $match: {
        seller: { $in: userIds },
      },
    },
    {
      $group: {
        _id: '$seller',
        productsCount: { $sum: 1 },
      },
    },
  ]);
};

export const fetchClientCommercialDetails = async (user) => {
  const clientOrders = await Order.find({
    $or: [
      { customerId: user._id },
      { customerPhone: user.phone },
      { customerEmail: user.email },
    ],
  })
    .sort({ createdAt: -1 })
    .limit(10)
    .lean();

  const totalSpent = clientOrders
    .filter((o) => o.orderStatus !== 'annulee')
    .reduce((sum, o) => sum + (o.total || 0), 0);

  return {
    ordersCount: clientOrders.length,
    totalSpent,
    lastOrder: clientOrders[0] || null,
    recentOrders: clientOrders,
  };
};

export const fetchSellerCommercialDetails = async (user) => {
  const [sellerProducts, sellerOrders] = await Promise.all([
    Product.find({ seller: user._id }).lean(),
    Order.find({ 'items.sellerId': user._id }).sort({ createdAt: -1 }).limit(10).lean(),
  ]);

  const activeProducts = sellerProducts.filter((p) => p.inStock !== false).length;
  const inactiveProducts = sellerProducts.length - activeProducts;

  let sellerRevenue = 0;
  sellerOrders.forEach((o) => {
    if (o.orderStatus !== 'annulee') {
      o.items.forEach((item) => {
        if (item.sellerId && item.sellerId.toString() === user._id.toString()) {
          sellerRevenue += (item.price || 0) * (item.quantity || 1);
        }
      });
    }
  });

  return {
    shopName: user.shopName || `${user.name} Boutique`,
    shopDescription: user.shopDescription || '',
    shopPhone: user.shopPhone || user.phone,
    totalProducts: sellerProducts.length,
    activeProducts,
    inactiveProducts,
    totalSellerOrders: sellerOrders.length,
    sellerRevenue,
    recentProducts: sellerProducts.slice(0, 5),
  };
};
