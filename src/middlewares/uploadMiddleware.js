import multer from 'multer';

// Stockage en mémoire vive (Buffer) pour transmission directe vers Cloudinary
const storage = multer.memoryStorage();

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.avif'];

const fileFilter = (req, file, cb) => {
  const mimeAllowed = ALLOWED_MIME_TYPES.includes(file.mimetype);
  const ext = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf('.'));
  const extAllowed = ALLOWED_EXTENSIONS.includes(ext);

  if (mimeAllowed && extAllowed) {
    cb(null, true);
  } else {
    cb(
      new Error(
        'Format de fichier non supporté. Seules les images aux formats JPG, JPEG, PNG, WEBP et AVIF sont acceptées.'
      ),
      false
    );
  }
};

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // Limite stricte de 5 Mo par image
    files: 5, // Maximum 5 fichiers simultanés
  },
  fileFilter,
});

export const uploadSingleImage = upload.single('image');
export const uploadMultipleImages = upload.array('images', 5);
