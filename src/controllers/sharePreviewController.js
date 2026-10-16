import mongoose from 'mongoose';
import { Product } from '../models/Product.js';

/**
 * Détecte si la requête provient d'un robot d'indexation ou d'un agent de prévisualisation sociale.
 * @param {string} userAgent - L'en-tête User-Agent HTTP.
 * @returns {boolean}
 */
const isSocialCrawler = (userAgent = '') => {
  const ua = userAgent.toLowerCase();
  return (
    ua.includes('whatsapp') ||
    ua.includes('facebookexternalhit') ||
    ua.includes('facebot') ||
    ua.includes('twitterbot') ||
    ua.includes('telegrambot') ||
    ua.includes('linkedinbot') ||
    ua.includes('pinterest') ||
    ua.includes('slackbot') ||
    ua.includes('discordbot') ||
    ua.includes('applebot') ||
    ua.includes('googlebot') ||
    ua.includes('bingbot')
  );
};

/**
 * Échappe les caractères HTML pour éviter toute injection dans les métadonnées.
 * @param {string} str - La chaîne à sécuriser.
 * @returns {string}
 */
const escapeHtml = (str = '') => {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

/**
 * Contrôleur de prévisualisation sociale pour les partages de produits.
 * Fournit les métadonnées Open Graph / Twitter Cards pour les robots et redirige les visiteurs réels.
 */
export const getProductSharePreview = async (req, res, next) => {
  try {
    const { identifier } = req.params;

    if (!identifier || typeof identifier !== 'string' || !identifier.trim()) {
      return res.status(404).send('<!DOCTYPE html><html><head><title>Produit introuvable</title></head><body><h1>Produit introuvable</h1></body></html>');
    }

    const clean = identifier.trim();
    const isObjectId = mongoose.Types.ObjectId.isValid(clean);
    const query = isObjectId
      ? { $or: [{ _id: clean }, { slug: clean.toLowerCase() }], isArchived: { $ne: true } }
      : { slug: clean.toLowerCase(), isArchived: { $ne: true } };

    const product = await Product.findOne(query).populate('seller', 'shopName name');
    if (!product) {
      return res.status(404).send('<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Produit introuvable | Vicky-Shop</title></head><body><h1>Ce produit est indisponible ou a été retiré.</h1></body></html>');
    }

    const frontendBaseUrl = (process.env.FRONTEND_URL || 'https://vickyshop.vercel.app').replace(/\/+$/, '');
    const canonicalSlug = product.slug || String(product._id);
    const canonicalUrl = `${frontendBaseUrl}/produit/${encodeURIComponent(canonicalSlug)}`;

    // Si la requête provient d'un humain et non d'un bot crawler, redirection directe
    const userAgent = req.headers['user-agent'] || '';
    if (!isSocialCrawler(userAgent) && req.query.bot !== '1') {
      return res.redirect(302, canonicalUrl);
    }

    const sellerName = product.seller?.shopName || product.seller?.name || product.sellerName || 'Vicky-Shop Officiel';
    const cleanTitle = escapeHtml(product.title);
    const cleanDesc = escapeHtml(
      product.description
        ? product.description.slice(0, 200)
        : `Découvrez ${product.title} au prix de ${product.price.toLocaleString('fr-FR')} FCFA sur Vicky-Shop. Vendu par ${sellerName}.`
    );
    const imageUrl = product.image ? (product.image.startsWith('http') ? product.image : `${frontendBaseUrl}${product.image}`) : 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800';

    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <title>${cleanTitle} | Vicky-Shop</title>
  <meta name="description" content="${cleanDesc}" />
  <link rel="canonical" href="${canonicalUrl}" />

  <!-- Open Graph / Facebook / WhatsApp -->
  <meta property="og:type" content="product" />
  <meta property="og:site_name" content="Vicky-Shop" />
  <meta property="og:title" content="${cleanTitle}" />
  <meta property="og:description" content="${cleanDesc}" />
  <meta property="og:image" content="${escapeHtml(imageUrl)}" />
  <meta property="og:image:alt" content="${cleanTitle}" />
  <meta property="og:url" content="${canonicalUrl}" />
  <meta property="product:price:amount" content="${product.price}" />
  <meta property="product:price:currency" content="XOF" />

  <!-- Twitter / X Cards -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${cleanTitle}" />
  <meta name="twitter:description" content="${cleanDesc}" />
  <meta name="twitter:image" content="${escapeHtml(imageUrl)}" />

  <!-- Redirection instantanée de secours pour navigateurs humains -->
  <meta http-equiv="refresh" content="0;url=${canonicalUrl}" />
  <script>window.location.replace("${canonicalUrl}");</script>
</head>
<body style="font-family:sans-serif;background:#0c0f17;color:#f8fafc;padding:2rem;text-align:center;">
  <h2>Redirection vers Vicky-Shop...</h2>
  <p><a href="${canonicalUrl}" style="color:#ff6b00;text-decoration:underline;">Cliquez ici si la redirection ne s'effectue pas automatiquement.</a></p>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400');
    return res.status(200).send(html);
  } catch (error) {
    next(error);
  }
};
