/**
 * Utilitaire d'assainissement et d'échappement contre les failles XSS (Cross-Site Scripting).
 * Nettoie les balises HTML, les scripts et les attributs d'événements dangereux.
 */

const HTML_ENTITIES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '/': '&#x2F;',
  '`': '&#x60;',
  '=': '&#x3D;',
};

/**
 * Échappe les caractères HTML spéciaux d'une chaîne.
 * @param {string} str 
 * @returns {string}
 */
export const escapeHtml = (str) => {
  if (typeof str !== 'string') return '';
  return str.replace(/[&<>"'`=\/]/g, (s) => HTML_ENTITIES[s] || s);
};

/**
 * Supprime les balises HTML, scripts et gestionnaires d'événements dangereux (onclick, onerror, javascript:).
 * @param {string} str 
 * @returns {string}
 */
export const sanitizeText = (str) => {
  if (typeof str !== 'string') return '';
  
  return str
    // Suppression des balises script et style complètes
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    // Suppression de toutes les balises HTML
    .replace(/<[^>]+>/g, '')
    // Suppression des pseudos-protocoles dangereux (javascript:, data:, vbscript:)
    .replace(/(javascript|vbscript|data):/gi, '')
    // Suppression des attributs d'événements (onload=, onerror=, etc.)
    .replace(/on\w+\s*=/gi, '')
    .trim();
};

/**
 * Assainit récursivement les champs textuels d'un objet selon une liste de clés ou globalement.
 * @param {Object} obj 
 * @param {string[]} specificFields 
 * @returns {Object}
 */
export const sanitizeObjectFields = (obj, specificFields = []) => {
  if (!obj || typeof obj !== 'object') return obj;

  const result = { ...obj };
  for (const key of Object.keys(result)) {
    const val = result[key];
    if (typeof val === 'string') {
      if (specificFields.length === 0 || specificFields.includes(key)) {
        result[key] = sanitizeText(val);
      }
    } else if (val && typeof val === 'object' && !Array.isArray(val)) {
      result[key] = sanitizeObjectFields(val, specificFields);
    }
  }

  return result;
};
