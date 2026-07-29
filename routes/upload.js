const express = require('express');
const router = express.Router();
const { upload, cloudinary } = require('../config/cloudinary');

// @route   POST /api/upload
// @desc    Upload a single image to Cloudinary, returns { url }
router.post('/', upload.single('image'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ msg: 'No image file provided' });
        }
        // Cloudinary URL is automatically set by multer-storage-cloudinary
        res.json({ url: req.file.path });
    } catch (err) {
        console.error('Upload error:', err);
        res.status(500).json({ msg: 'Image upload failed', error: err.message });
    }
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
