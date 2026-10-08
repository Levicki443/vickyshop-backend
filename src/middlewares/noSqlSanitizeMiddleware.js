/**
 * Middleware d'assainissement récursif contre les injections NoSQL.
 * Supprime ou neutralise toute clé commençant par '$' ou contenant des points '.'
 * dans req.body, req.query et req.params afin de protéger MongoDB / Mongoose.
 */

export const cleanObject = (obj) => {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => cleanObject(item));
  }

  const cleaned = {};
  for (const key of Object.keys(obj)) {
    // Si la clé commence par '$' (opérateur MongoDB) ou contient des points '.', on la rejette
    if (key.startsWith('$') || key.includes('.')) {
      continue;
    }

    const value = obj[key];
    if (value !== null && typeof value === 'object') {
      cleaned[key] = cleanObject(value);
    } else {
      cleaned[key] = value;
    }
  }

  return cleaned;
};

export const sanitizeNoSqlValue = cleanObject;

export const sanitizeNoSql = (req, res, next) => {
  if (req.body) {
    req.body = cleanObject(req.body);
  }
  if (req.query) {
    req.query = cleanObject(req.query);
  }
  if (req.params) {
    req.params = cleanObject(req.params);
  }
  next();
};
