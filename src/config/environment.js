import dotenv from 'dotenv';

// Chargement des variables d'environnement
dotenv.config();

const isProduction = process.env.NODE_ENV === 'production';

// Validation des secrets critiques en environnement de production
if (isProduction) {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    console.error('CRITIQUE SÉCURITÉ : La variable JWT_SECRET doit comporter au moins 32 caractères en production.');
  }
  if (!process.env.ADMIN_SECRET_KEY && !process.env.ADMIN_SECRET && !process.env.AD_PW) {
    console.warn('AVERTISSEMENT SÉCURITÉ : Aucune clé secrète d\'administration personnalisée n\'est configurée.');
  }
}

/**
 * Configuration centralisée et durcie de l'application Vicky-Shop.
 */
export const config = {
  env: process.env.NODE_ENV || 'development',
  isProduction,
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
    secretKey: (
      process.env.AD_PW ||
      process.env.ADMIN_REGISTRATION_SECRET ||
      process.env.ADMIN_SECRET_KEY ||
      process.env.ADMIN_SECRET ||
      (isProduction ? '' : 'vicky_admin_secret_key_2026_abidjan_master')
    ).trim(),
  },

  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: isProduction ? 200 : 2000,
  },

  brevo: {
    apiKey: (process.env.BREVO_API_KEY || process.env.SENDINBLUE_API_KEY || '').trim(),
    senderEmail: (process.env.BREVO_SENDER_EMAIL || process.env.SENDER_EMAIL || 'contact@vickyshop.ci').trim(),
    senderName: (process.env.BREVO_SENDER_NAME || process.env.SENDER_NAME || 'Vicky-Shop Abidjan').trim(),
  },

  cloudinary: {
    cloudName: (process.env.CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_NAME || '').trim(),
    apiKey: (process.env.CLOUDINARY_API_KEY || '').trim(),
    apiSecret: (process.env.CLOUDINARY_API_SECRET || '').trim(),
    url: (process.env.CLOUDINARY_URL || '').trim(),
    folder: process.env.CLOUDINARY_FOLDER || 'vickyshop/products',
  },
};
