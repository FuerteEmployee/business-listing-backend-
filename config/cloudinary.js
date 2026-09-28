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

// Brochures are stored as 'raw' resources: Cloudinary blocks delivery of PDFs uploaded
// as images on many accounts, and raw keeps the file byte-for-byte (no transformations).
const documentStorage = new CloudinaryStorage({
    cloudinary,
    params: async (req, file) => {
        const baseName = file.originalname
            .replace(/\.pdf$/i, '')
            .replace(/[^a-zA-Z0-9-_]+/g, '-')
            .slice(0, 60) || 'brochure';
        return {
            folder: 'fuertedevelopers/brochures',
            resource_type: 'raw',
            // Raw public_ids keep the extension, so the delivered URL ends in .pdf
            public_id: `${Date.now()}-${baseName}.pdf`,
        };
    },
});

// Multer upload middleware for PDF documents — single file with field name "document"
const uploadDocument = multer({
    storage: documentStorage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf' || /\.pdf$/i.test(file.originalname)) {
            cb(null, true);
        } else {
            cb(new Error('Only PDF files are allowed for brochures!'), false);
        }
    }
});

module.exports = { cloudinary, upload, uploadDocument };
