import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config/environment.js';
import { sanitizeNoSql } from './middlewares/noSqlSanitizeMiddleware.js';

import productRoutes from './routes/productRoutes.js';
import orderRoutes from './routes/orderRoutes.js';
import authRoutes from './routes/authRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import sellerRoutes from './routes/sellerRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import { ShopSettings } from './models/ShopSettings.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../');

const app = express();

// 1. Sécurité des en-têtes HTTP avec Helmet (Durcissement Production & CSP)
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdnjs.cloudflare.com', 'https://cdn.jsdelivr.net'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://cdnjs.cloudflare.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'https://cdnjs.cloudflare.com'],
        imgSrc: ["'self'", 'data:', 'blob:', 'https://res.cloudinary.com', 'https://images.unsplash.com'],
        connectSrc: ["'self'", 'ws:', 'wss:', 'http://localhost:5000', 'https://*.cloudinary.com'],
        frameAncestors: ["'none'"], // Protection anti-Clickjacking
      },
    },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    frameguard: { action: 'deny' },
    noSniff: true,
    xssFilter: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  })
);

// 2. Configuration CORS stricte et dynamique
const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) {
      return callback(null, true);
    }

    const normalizedOrigin = origin.replace(/\/+$/, '');

    const isAllowed =
      config.cors.allowedOrigins.includes('*') ||
      config.cors.allowedOrigins.includes(origin) ||
      config.cors.allowedOrigins.includes(normalizedOrigin);

    if (isAllowed) {
      return callback(null, true);
    }

    const isLocalOrNetworkIP = /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?$/.test(origin);
    if (isLocalOrNetworkIP) {
      return callback(null, true);
    }

    if (config.cors.allowedOrigins.length === 0) {
      return callback(null, true);
    }

    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// 3. Analyseurs de corps de requête avec limites strictes (Anti-DoS)
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// 4. Protection Globale Anti-Injection NoSQL (Suppression des clés $ et .)
app.use(sanitizeNoSql);

// 5. Journalisation des requêtes en développement
if (!config.isProduction) {
  app.use(morgan('dev'));
}

// 6. Fichiers multimédias statiques
app.use('/photo', express.static(path.join(rootDir, 'photo')));
app.use('/image 1 pulle & chapeau', express.static(path.join(rootDir, 'image 1 pulle & chapeau')));
app.use('/image 2 complet d habit', express.static(path.join(rootDir, 'image 2 complet d habit')));

// 7. Point de santé & Routes de l'API
app.get(['/', '/health', '/api/health'], (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'API Vicky-Shop Marketplace opérationnelle et hautement sécurisée',
    environment: config.env,
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/seller', sellerRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/admin', adminRoutes);

// Route publique pour les paramètres de la boutique
app.get('/api/settings', async (req, res, next) => {
  try {
    const settings = await ShopSettings.getSettings();
    res.status(200).json({
      status: 'success',
      data: { settings },
    });
  } catch (error) {
    next(error);
  }
});

// 8. Gestion des routes non trouvées (404)
app.use((req, res) => {
  res.status(404).json({
    status: 'error',
    code: 404,
    message: `La ressource demandée (${req.originalUrl}) est introuvable.`,
  });
});

// 9. Gestionnaire centralisé des erreurs (Zero Data Leakage en Production)
app.use((err, req, res, next) => {
  const statusCode = err.statusCode || (err.name === 'ValidationError' ? 400 : 500);
  const response = {
    status: 'error',
    code: statusCode,
    message: err.message || 'Une erreur interne est survenue sur le serveur.',
  };

  if (!config.isProduction && err.stack) {
    response.stack = err.stack;
  }

  res.status(statusCode).json(response);
});

export default app;
