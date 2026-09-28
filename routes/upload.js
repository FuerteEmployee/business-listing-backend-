const express = require('express');
const router = express.Router();
const { upload, uploadDocument, cloudinary } = require('../config/cloudinary');
const { protect } = require('../middleware/authMiddleware');

// @route   POST /api/upload
// @desc    Upload a single image to Cloudinary, returns { url }
router.post('/', (req, res) => {
    upload.single('image')(req, res, (err) => {
        if (err) {
            console.error('Multer/Cloudinary error:', err);
            return res.status(400).json({ msg: err.message || 'Error uploading file' });
        }
        try {
            if (!req.file) {
                return res.status(400).json({ msg: 'No image file provided' });
            }
            // Cloudinary URL is automatically set by multer-storage-cloudinary
            res.json({ url: req.file.path });
        } catch (error) {
            console.error('Upload error:', error);
            res.status(500).json({ msg: 'Image upload failed', error: error.message });
        }
    });
});

// @route   POST /api/upload/document
// @desc    Upload a single PDF (e.g. a brochure) to Cloudinary, returns { url, name, size, publicId }
router.post('/document', protect, (req, res) => {
    uploadDocument.single('document')(req, res, (err) => {
        if (err) {
            console.error('Multer/Cloudinary document error:', err);
            const msg = err.code === 'LIMIT_FILE_SIZE' ? 'PDF must be 10MB or smaller' : (err.message || 'Error uploading file');
            return res.status(400).json({ msg });
        }
        if (!req.file) {
            return res.status(400).json({ msg: 'No PDF file provided' });
        }
        res.json({
            url: req.file.path,
            name: req.file.originalname.replace(/\.pdf$/i, ''),
            size: req.file.size || 0,
            publicId: req.file.filename
        });
    });
});

// @route   DELETE /api/upload/:publicId
// @desc    Delete an image from Cloudinary by public_id
router.delete('/:publicId', async (req, res) => {
    try {
        const result = await cloudinary.uploader.destroy(req.params.publicId);
        res.json({ msg: 'Image deleted', result });
    } catch (err) {
        console.error('Delete error:', err);
        res.status(500).json({ msg: 'Image deletion failed' });
    }
});

module.exports = router;
