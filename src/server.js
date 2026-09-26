import http from 'http';
import app from './app.js';
import { config } from './config/environment.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { initSocket } from './config/socket.js';

/**
 * Initialisation du serveur HTTP, de Socket.IO et de la base de données.
 */
const startServer = async () => {
  // Connexion à la base de données
  await connectDatabase();

  // Création du serveur HTTP natif avec Express
  const httpServer = http.createServer(app);

  // Initialisation de Socket.IO
  initSocket(httpServer);

  // Démarrage de l'écoute HTTP (0.0.0.0 pour compatibilité totale Render/Cloud)
  const server = httpServer.listen(config.port, '0.0.0.0', () => {
    console.log(`====================================================`);
    console.log(`[SERVEUR] Vicky-Shop démarré sur le port : ${config.port}`);
    console.log(`[SERVEUR] Environnement : ${config.env}`);
    console.log(`[SERVEUR] WebSocket : Socket.IO actif`);
    console.log(`[SERVEUR] Point de santé : /api/health`);
    console.log(`[SERVEUR] Origines CORS autorisées : ${config.cors.allowedOrigins.join(', ')}`);
    console.log(`====================================================`);
  });

  // Gestion de l'arrêt gracieux (Graceful Shutdown)
  const handleShutdown = async (signal) => {
    console.log(`\n[Serveur] Signal ${signal} reçu. Arrêt gracieux en cours...`);
    
    server.close(async () => {
      console.log('[Serveur] Serveur HTTP fermé.');
      await disconnectDatabase();
      console.log('[Serveur] Processus terminé proprement.');
      process.exit(0);
    });

    // Forcer l'arrêt si les connexions mettent trop de temps à se clore
    setTimeout(() => {
      console.error('[Serveur] Fermeture forcée après délai d\'attente dépassé.');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));

  // Capture des erreurs non gérées
  process.on('unhandledRejection', (reason, promise) => {
    console.error('[Serveur] Rejet non géré détecté :', reason);
  });

  process.on('uncaughtException', (error) => {
    console.error('[Serveur] Exception non interceptée :', error);
    process.exit(1);
  });
};

startServer();
