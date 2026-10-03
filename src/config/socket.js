import { Server } from 'socket.io';
import { config } from './environment.js';

let io = null;

/**
 * Initialise le serveur WebSocket Socket.IO avec gestion CORS stricte.
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

  io.on('connection', (socket) => {
    // 1. Rejoindre la salle privée de l'administrateur
    socket.on('admin:join', () => {
      socket.join('admin_room');
    });

    // 2. Rejoindre la salle privée d'un vendeur spécifique
    socket.on('seller:join', (sellerId) => {
      if (sellerId) {
        socket.join(`seller_${sellerId}`);
      }
    });

    // 3. Rejoindre la salle privée d'un client spécifique
    socket.on('user:join', (userId) => {
      if (userId) {
        socket.join(`user_${userId}`);
      }
    });

    // 4. Rejoindre la salle de suivi d'une commande spécifique (par référence)
    socket.on('order:track', (orderNumber) => {
      if (orderNumber) {
        socket.join(`order:${orderNumber}`);
      }
    });

    socket.on('disconnect', () => {
      // Nettoyage automatique effectué par Socket.IO
    });
  });

  console.log('[Socket.IO] Serveur temps réel initialisé avec succès.');
  return io;
};

/**
 * Récupère l'instance active de Socket.IO.
 */
export const getIO = () => {
  return io;
};

/**
 * Émet un événement ciblé vers un utilisateur/client spécifique.
 */
export const notifyUser = (userId, event, data) => {
  if (io && userId) {
    io.to(`user_${userId}`).emit(event, data);
  }
};

/**
 * Émet un événement ciblé exclusivement vers un vendeur donné (Isolation stricte).
 */
export const notifySeller = (sellerId, event, data) => {
  if (io && sellerId) {
    io.to(`seller_${sellerId}`).emit(event, data);
  }
};

/**
 * Émet un événement à l'ensemble des administrateurs connectés (dashboard).
 */
export const notifyAdmins = (event, data) => {
  if (io) {
    io.to('admin_room').emit(event, data);
  }
};

/**
 * Émet un événement de mise à jour pour une commande spécifique (suivi en direct).
 */
export const notifyOrderUpdate = (orderNumber, event, data) => {
  if (io && orderNumber) {
    io.to(`order:${orderNumber}`).emit(event, data);
    io.to('admin_room').emit(event, data);
  }
};

/**
 * Émet un événement à l'ensemble des clients connectés.
 */
export const broadcastToAll = (event, data) => {
  if (io) {
    io.emit(event, data);
  }
};

/**
 * Émetteurs d'événements Produits en temps réel
 */
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
