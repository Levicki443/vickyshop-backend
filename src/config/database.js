import mongoose from 'mongoose';
import { config } from './environment.js';

/**
 * Gestionnaire de connexion à la base de données MongoDB.
 * Inclut la gestion des événements de connexion et les reconnexions automatiques.
 */
export const connectDatabase = async () => {
  try {
    const options = {
      autoIndex: !config.isProduction, // Désactive l'indexation auto en production pour de meilleures perfs
      maxPoolSize: 10, // Gestion optimale du pool de connexions
      serverSelectionTimeoutMS: 5000, // Timeout rapide en cas d'échec
      socketTimeoutMS: 45000,
    };

    const conn = await mongoose.connect(config.database.uri, options);

    console.log(`[Base de données] MongoDB connecté avec succès : ${conn.connection.host}`);

    mongoose.connection.on('error', (err) => {
      console.error('[Base de données] Erreur de connexion MongoDB :', err.message);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('[Base de données] Connexion MongoDB interrompue. Tentative de reconnexion...');
    });

    return conn;
  } catch (error) {
    console.error(`[Base de données] Échec de la connexion MongoDB : ${error.message}`);
    // En production, on ne crashe pas sauvagement sans journaliser
    if (config.isProduction) {
      process.exit(1);
    }
  }
};

/**
 * Fermeture propre de la connexion à la base de données.
 */
export const disconnectDatabase = async () => {
  try {
    await mongoose.connection.close();
    console.log('[Base de données] Connexion MongoDB fermée proprement.');
  } catch (error) {
    console.error('[Base de données] Erreur lors de la fermeture MongoDB :', error.message);
  }
};
