import cloudinary from '../config/cloudinary.js';
import { config } from '../config/environment.js';
import crypto from 'crypto';

/**
 * Vérifie si Cloudinary est correctement configuré via les variables d'environnement.
 */
export const isCloudinaryConfigured = () => {
  return Boolean(
    config.cloudinary.url ||
    (config.cloudinary.cloudName && config.cloudinary.apiKey && config.cloudinary.apiSecret)
  );
};

/**
 * Téléverse un tampon de fichier directement vers Cloudinary avec nom aléatoire cryptographique.
 * @param {Buffer} buffer 
 * @param {string} originalName 
 * @param {string} subfolder 
 * @returns {Promise<{ url: string, secure_url: string, public_id: string, width: number, height: number, format: string }>}
 */
export const uploadBufferToCloudinary = (buffer, originalName = 'image', subfolder = '') => {
  return new Promise((resolve, reject) => {
    if (!isCloudinaryConfigured()) {
      return reject(
        new Error('Cloudinary non configuré. Veuillez renseigner CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY et CLOUDINARY_API_SECRET.')
      );
    }

    const randomSuffix = crypto.randomBytes(12).toString('hex');
    const publicId = `img_${Date.now()}_${randomSuffix}`;
    const folderPath = subfolder
      ? `${config.cloudinary.folder}/${subfolder}`.replace(/\/+/g, '/')
      : config.cloudinary.folder;

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: folderPath,
        public_id: publicId,
        resource_type: 'image',
        transformation: [
          { width: 1200, height: 1200, crop: 'limit' },
          { quality: 'auto:good' },
          { fetch_format: 'auto' },
        ],
      },
      (error, result) => {
        if (error) {
          console.error('[Cloudinary] Erreur upload stream :', error.message);
          return reject(error);
        }
        resolve({
          url: result.secure_url || result.url,
          secure_url: result.secure_url,
          public_id: result.public_id,
          width: result.width,
          height: result.height,
          format: result.format,
        });
      }
    );

    uploadStream.end(buffer);
  });
};

/**
 * Supprime une image hébergée sur Cloudinary via son public_id.
 * @param {string} publicId 
 */
export const deleteFromCloudinary = async (publicId) => {
  if (!isCloudinaryConfigured() || !publicId) return null;
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return result;
  } catch (err) {
    console.warn(`[Cloudinary] Impossible de supprimer ${publicId} :`, err.message);
    return null;
  }
};
