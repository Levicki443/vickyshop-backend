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
    // Rejoindre la salle privée d'administration
    socket.on('admin:join', () => {
      socket.join('admin_room');
      console.log(`[Socket.IO] Client ${socket.id} a rejoint la salle admin_room`);
    });

    // Rejoindre la salle de suivi d'une commande spécifique
    socket.on('order:track', (orderNumber) => {
      if (orderNumber) {
        socket.join(`order:${orderNumber}`);
      }
    });

    socket.on('disconnect', (reason) => {
      // Nettoyage automatique des rooms
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
 * Émet un événement à l'ensemble des administrateurs connectés (dashboard).
 * @param {string} event 
 * @param {any} data 
 */
export const notifyAdmins = (event, data) => {
  if (io) {
    io.to('admin_room').emit(event, data);
  }
};

/**
 * Émet un événement de mise à jour pour une commande spécifique.
 * @param {string} orderNumber 
 * @param {string} event 
 * @param {any} data 
 */
export const notifyOrderUpdate = (orderNumber, event, data) => {
  if (io) {
    io.to(`order:${orderNumber}`).emit(event, data);
    // Notifie également les admins
    io.to('admin_room').emit(event, data);
  }
};
