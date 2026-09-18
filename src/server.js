import app from './app.js';
import { config } from './config/environment.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';

/**
 * Initialisation du serveur HTTP et de la base de données.
 */
const startServer = async () => {
  // Connexion à la base de données
  await connectDatabase();

  // Démarrage de l'écoute HTTP
  const server = app.listen(config.port, () => {
    console.log(`====================================================`);
    console.log(`🚀 Serveur Vicky-Shop démarré sur le port : ${config.port}`);
    console.log(`🌍 Environnement : ${config.env}`);
    console.log(`🔗 Point de santé : http://localhost:${config.port}/api/health`);
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
