import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from './environment.js';
import { User } from '../models/User.js';
import { isSellerRole, isAdminRole } from '../utils/roleUtils.js';
import { securityLog } from '../utils/securityLogger.js';

let io = null;

/**
 * Initialise le serveur WebSocket Socket.IO avec authentification JWT et contrôle RBAC des canaux.
 * @param {import('http').Server} httpServer 
 * @returns {Server}
 */
export const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        const normalized = origin.replace(/\/+$/, '');
        const isAllowed =
          config.cors.allowedOrigins.includes('*') ||
          config.cors.allowedOrigins.includes(origin) ||
          config.cors.allowedOrigins.includes(normalized) ||
          /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?$/.test(origin);

        if (isAllowed || config.cors.allowedOrigins.length === 0) {
          return callback(null, true);
        }
        return callback(new Error('Origine Socket.IO non autorisée'));
      },
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  // Middleware d'authentification Socket.IO (Zero-Trust)
  io.use(async (socket, next) => {
    try {
      const rawToken =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, '');

      if (!rawToken) {
        // Connexion invitée autorisée uniquement pour les diffusions publiques de catalogue
        socket.user = null;
        return next();
      }

      const decoded = jwt.verify(rawToken, config.jwt.secret);
      const user = await User.findById(decoded.id);

      if (user) {
        socket.user = user;
      } else {
        socket.user = null;
      }
      next();
    } catch (err) {
      // Si jeton invalide, on laisse la connexion en mode invité non privilégié
      socket.user = null;
      next();
    }
  });

  io.on('connection', (socket) => {
    // Si l'utilisateur est authentifié, abonnement automatique et sécurisé à ses canaux autorisés
    if (socket.user) {
      const userId = socket.user._id.toString();
      socket.join(`user_${userId}`);

      if (isSellerRole(socket.user.role)) {
        socket.join(`seller_${userId}`);
      }

      if (isAdminRole(socket.user.role)) {
        socket.join('admin_room');
      }
    }

    // Demande explicite de rejoindre la salle d'administration (Vérification stricte de privilèges)
    socket.on('admin:join', () => {
      if (socket.user && isAdminRole(socket.user.role)) {
        socket.join('admin_room');
      } else {
        securityLog.accessDenied({
          userId: socket.user?._id,
          role: socket.user?.role,
          route: 'socket:admin:join',
          method: 'WS',
          reason: 'Tentative non autorisée d\'écoute du canal administrateur',
        });
      }
    });

    // Demande explicite de rejoindre la salle d'un vendeur (Isolation Multi-Vendeur)
    socket.on('seller:join', (targetSellerId) => {
      if (
        socket.user &&
        (isAdminRole(socket.user.role) || (isSellerRole(socket.user.role) && socket.user._id.toString() === targetSellerId?.toString()))
      ) {
        socket.join(`seller_${targetSellerId}`);
      } else {
        securityLog.accessDenied({
          userId: socket.user?._id,
          role: socket.user?.role,
          route: `socket:seller:join:${targetSellerId}`,
          method: 'WS',
          reason: 'Tentative d\'écoute illégitime d\'un canal vendeur tiers',
        });
      }
    });

    // Demande explicite de rejoindre la salle d'un client
    socket.on('user:join', (targetUserId) => {
      if (
        socket.user &&
        (isAdminRole(socket.user.role) || socket.user._id.toString() === targetUserId?.toString())
      ) {
        socket.join(`user_${targetUserId}`);
      }
    });

    // Suivi de commande en temps réel
    socket.on('order:track', (orderNumber) => {
      if (orderNumber && typeof orderNumber === 'string') {
        const sanitized = orderNumber.replace(/[^a-zA-Z0-9-]/g, '').trim();
        if (sanitized) {
          socket.join(`order:${sanitized}`);
        }
      }
    });
  });

  console.log('[Socket.IO] Serveur temps réel sécurisé initialisé avec succès.');
  return io;
};

export const getIO = () => io;

export const notifyUser = (userId, event, data) => {
  if (io && userId) {
    io.to(`user_${userId}`).emit(event, data);
  }
};

export const notifySeller = (sellerId, event, data) => {
  if (io && sellerId) {
    io.to(`seller_${sellerId}`).emit(event, data);
  }
};

export const notifyAdmins = (event, data) => {
  if (io) {
    io.to('admin_room').emit(event, data);
  }
};

export const notifyOrderUpdate = (orderNumber, event, data) => {
  if (io && orderNumber) {
    io.to(`order:${orderNumber}`).emit(event, data);
    io.to('admin_room').emit(event, data);
  }
};

export const broadcastToAll = (event, data) => {
  if (io) {
    io.emit(event, data);
  }
};

export const notifyProductCreated = (product) => {
  broadcastToAll('product:created', product);
  notifyAdmins('product:created', product);
};

export const notifyProductUpdated = (product) => {
  broadcastToAll('product:updated', product);
  notifyAdmins('product:updated', product);
};

export const notifyProductDeleted = (productId) => {
  broadcastToAll('product:deleted', { id: productId });
  notifyAdmins('product:deleted', { id: productId });
};

export const notifyProductStock = (productId, stockQuantity, inStock) => {
  broadcastToAll('product:stock_updated', { id: productId, stockQuantity, inStock });
  notifyAdmins('product:stock_updated', { id: productId, stockQuantity, inStock });
};

export const notifySettingsUpdated = (settings) => {
  broadcastToAll('settings:updated', settings);
  notifyAdmins('settings:updated', settings);
};
