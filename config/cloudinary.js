const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

// Configure Cloudinary credentials from .env
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Set up multer-storage-cloudinary
const storage = new CloudinaryStorage({
    cloudinary,
    params: async (req, file) => ({
        folder: 'fuertedevelopers',           // All uploads go into a 'fuertedevelopers' folder on Cloudinary
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'mp4', 'mov'],
        resource_type: 'auto',        // Important for video support
        transformation: file.mimetype.startsWith('video/') 
            ? [{ width: 800, crop: 'limit', fetch_format: 'mp4' }] 
            : [{ width: 800, crop: 'limit' }],
        public_id: `${Date.now()}-${file.originalname.split('.')[0]}`,
    }),
});

// Multer upload middleware — single file with field name "image"
const upload = multer({
    storage,
    limits: { fileSize: 20 * 1024 * 1024 }, // Increased to 20MB for videos
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/') || file.mimetype === 'video/mp4' || file.mimetype === 'video/quicktime') {
            cb(null, true);
        } else {
            cb(new Error('Only images, MP4, and MOV videos are allowed!'), false);
        }
    }
});

module.exports = { cloudinary, upload };
