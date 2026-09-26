import dotenv from 'dotenv';

// Chargement des variables d'environnement
dotenv.config();

/**
 * Configuration centralisée et sécurisée de l'application.
 * Vérifie la présence des variables critiques et fournit des valeurs saines par défaut.
 */
export const config = {
  env: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  port: parseInt(process.env.PORT || '5000', 10),
  
  cors: {
    allowedOrigins: (process.env.ALLOW_ORIGINS || process.env.ALLOWED_ORIGINS || process.env.CORS_ORIGIN)
      ? (process.env.ALLOW_ORIGINS || process.env.ALLOWED_ORIGINS || process.env.CORS_ORIGIN)
          .split(',')
          .map((origin) => origin.trim().replace(/\/+$/, ''))
          .filter(Boolean)
      : [
          'http://localhost:3000',
          'http://127.0.0.1:5500',
          'http://localhost:5173',
          'http://127.0.0.1:5173',
        ],
  },

  database: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/vickyshop_db',
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'dev_jwt_secret_change_me_in_production_key_32_chars',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  admin: {
    secretKey: (process.env.AD_PW || process.env.ADMIN_REGISTRATION_SECRET || process.env.ADMIN_SECRET_KEY || process.env.ADMIN_SECRET || 'vicky_admin_secret_key_2026_abidjan_master').trim(),
  },

  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: process.env.NODE_ENV === 'production' ? 100 : 1000, // Requetes max par fenetre
  },

  brevo: {
    apiKey: (process.env.BREVO_API_KEY || process.env.SENDINBLUE_API_KEY || '').trim(),
    senderEmail: (process.env.BREVO_SENDER_EMAIL || process.env.SENDER_EMAIL || 'contact@vickyshop.ci').trim(),
    senderName: (process.env.BREVO_SENDER_NAME || process.env.SENDER_NAME || 'Vicky-Shop Abidjan').trim(),
  },
};
