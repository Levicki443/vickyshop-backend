import { Order } from '../models/Order.js';
import { Product } from '../models/Product.js';
import { User } from '../models/User.js';

/**
 * Récupère l'ensemble des indicateurs clés de performance (KPIs) et finances.
 */
export const getDashboardKPIs = async (req, res, next) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const ordersStats = await Order.aggregate([
      {
        $group: {
          _id: null,
          totalRevenue: {
            $sum: { $cond: [{ $ne: ['$orderStatus', 'annulee'] }, '$total', 0] },
          },
          totalOrders: { $sum: 1 },
          deliveredOrders: {
            $sum: { $cond: [{ $eq: ['$orderStatus', 'livree'] }, 1, 0] },
          },
          pendingOrders: {
            $sum: {
              $cond: [
                { $in: ['$orderStatus', ['recue', 'en_preparation', 'en_livraison']] },
                1,
                0,
              ],
            },
          },
          cancelledOrders: {
            $sum: { $cond: [{ $eq: ['$orderStatus', 'annulee'] }, 1, 0] },
          },
        },
      },
    ]);

    const todayRevenueStats = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: today },
          orderStatus: { $ne: 'annulee' },
        },
      },
      {
        $group: {
          _id: null,
          todayRevenue: { $sum: '$total' },
          todayOrdersCount: { $sum: 1 },
        },
      },
    ]);

    const stats = ordersStats[0] || {
      totalRevenue: 0,
      totalOrders: 0,
      deliveredOrders: 0,
      pendingOrders: 0,
      cancelledOrders: 0,
    };

    const todayStats = todayRevenueStats[0] || {
      todayRevenue: 0,
      todayOrdersCount: 0,
    };

    const averageCart =
      stats.totalOrders > 0
        ? Math.round(stats.totalRevenue / Math.max(1, stats.totalOrders - stats.cancelledOrders))
        : 0;

    const totalCustomers = await User.countDocuments({ role: 'client' });
    const totalProducts = await Product.countDocuments({ isArchived: { $ne: true } });
    const outOfStockProducts = await Product.countDocuments({
      isArchived: { $ne: true },
      $or: [{ inStock: false }, { stockQuantity: { $lte: 0 } }],
    });

    const categoryBreakdown = await Order.aggregate([
      { $match: { orderStatus: { $ne: 'annulee' } } },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.title',
          totalSold: { $sum: '$items.quantity' },
          totalAmount: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
        },
      },
      { $sort: { totalSold: -1 } },
      { $limit: 6 },
    ]);

    const recentOrders = await Order.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    res.status(200).json({
      status: 'success',
      data: {
        kpis: {
          totalRevenue: stats.totalRevenue,
          todayRevenue: todayStats.todayRevenue,
          todayOrdersCount: todayStats.todayOrdersCount,
          totalOrders: stats.totalOrders,
          pendingOrders: stats.pendingOrders,
          deliveredOrders: stats.deliveredOrders,
          cancelledOrders: stats.cancelledOrders,
          averageCart,
          totalCustomers,
          totalProducts,
          outOfStockProducts,
        },
        categoryBreakdown,
        recentOrders,
      },
    });
  } catch (error) {
    next(error);
  }
};
