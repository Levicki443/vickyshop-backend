import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { config } from './config/environment.js';

import path from 'path';
import { fileURLToPath } from 'url';
import productRoutes from './routes/productRoutes.js';
import orderRoutes from './routes/orderRoutes.js';
import authRoutes from './routes/authRoutes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../');

const app = express();

// 1. Sécurité des en-têtes HTTP
app.use(helmet());

// 2. Configuration CORS sécurisée et dynamique
const corsOptions = {
  origin: (origin, callback) => {
    // Autorise les requêtes sans origine (applications mobiles, curl, Postman, Render health-checks)
    if (!origin) {
      return callback(null, true);
    }

    const normalizedOrigin = origin.replace(/\/+$/, '');

    // Vérifie si l'origine est dans la liste ALLOW_ORIGINS ou si '*' est présent
    const isAllowed =
      config.cors.allowedOrigins.includes('*') ||
      config.cors.allowedOrigins.includes(origin) ||
      config.cors.allowedOrigins.includes(normalizedOrigin);

    if (isAllowed) {
      return callback(null, true);
    }

    // Autorise également localhost et 127.0.0.1 sur n'importe quel port en dev
    if (!config.isProduction && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      return callback(null, true);
    }

    console.warn(`[CORS] Origine bloquée : "${origin}". Origines autorisées :`, config.cors.allowedOrigins);
    return callback(new Error(`Origine ${origin} non autorisée par la politique CORS`), false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// 3. Limitation du débit (Rate Limiting)
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 429,
    message: 'Trop de requêtes effectuées depuis cette adresse IP, veuillez réessayer plus tard.',
  },
});
app.use('/api', limiter);

// 4. Analyseurs de corps de requête (avec limite de taille stricte)
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// 5. Journalisation des requêtes
if (!config.isProduction) {
  app.use(morgan('dev'));
}

// 6. Fichiers multimédias statiques
app.use('/photo', express.static(path.join(rootDir, 'photo')));
app.use('/image 1 pulle & chapeau', express.static(path.join(rootDir, 'image 1 pulle & chapeau')));
app.use('/image 2 complet d habit', express.static(path.join(rootDir, 'image 2 complet d habit')));

// 7. Montage des routes de l'API
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'API Vicky-Shop opérationnelle',
    environment: config.env,
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/auth', authRoutes);

// 7. Gestion des routes non trouvées (404)
app.use((req, res, next) => {
  res.status(404).json({
    status: 'error',
    code: 404,
    message: `La ressource demandée (${req.originalUrl}) est introuvable sur ce serveur.`,
  });
});

// 8. Gestionnaire centralisé des erreurs (Standard Production)
app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const response = {
    status: 'error',
    code: statusCode,
    message: err.message || 'Une erreur interne est survenue sur le serveur.',
  };

  // En développement uniquement, inclure des informations supplémentaires
  if (!config.isProduction && err.stack) {
    response.stack = err.stack;
  }

  res.status(statusCode).json(response);
});

export default app;
