import { v2 as cloudinary } from 'cloudinary';
import { config } from './environment.js';

/**
 * Initialise et configure le client Cloudinary v2 pour Vicky-Shop.
 */
if (config.cloudinary.url) {
  cloudinary.config({
    cloudinary_url: config.cloudinary.url,
    secure: true,
  });
} else if (config.cloudinary.cloudName && config.cloudinary.apiKey && config.cloudinary.apiSecret) {
  cloudinary.config({
    cloud_name: config.cloudinary.cloudName,
    api_key: config.cloudinary.apiKey,
    api_secret: config.cloudinary.apiSecret,
    secure: true,
  });
}

export default cloudinary;
