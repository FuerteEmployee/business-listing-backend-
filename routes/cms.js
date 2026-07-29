const express = require('express');
const router = express.Router();
const multer = require('multer');
const {
    // Articles
    getArticles,
    getArticleBySlug,
    createArticle,
    updateArticle,
    deleteArticle,

    // Static Pages
    getStaticPages,
    getStaticPageBySlug,
    createStaticPage,
    updateStaticPage,
    deleteStaticPage,

    // Media
    uploadMedia,
    getMedia,
    deleteMedia,

    // FAQs
    getFAQs,
    getPublishedFAQs,
    createFAQ,
    updateFAQ,
    deleteFAQ,

    // Banners
    getBanners,
    createBanner,
    updateBanner,
    deleteBanner
} = require('../controllers/cmsController');
const { protect, authorize } = require('../middleware/authMiddleware');

// Configure multer for file uploads
const upload = multer({
    dest: 'tmp/',
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    },
    fileFilter: (req, file, cb) => {
        // Allow images, videos, documents
        const allowedTypes = [
            'image/jpeg', 'image/png', 'image/gif', 'image/webp',
            'video/mp4', 'video/avi', 'video/mov',
            'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        ];

        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type'), false);
        }
    }
});

// ==================== PUBLIC ROUTES (No Auth Required) ====================
// Public route for reading banners
router.get('/banners/public', getBanners);

// All routes below require authentication
router.use(protect);

// ==================== ARTICLE ROUTES ====================
// Admin routes (Admin/Super Admin only)
router.use('/articles', authorize('Admin', 'Super Admin'));
router.get('/articles', getArticles);
router.post('/articles', createArticle);
router.put('/articles/:id', updateArticle);
router.delete('/articles/:id', deleteArticle);

// Public route for reading articles
router.get('/articles/public/:slug', getArticleBySlug);

// ==================== STATIC PAGE ROUTES ====================
// Admin routes
router.use('/pages', authorize('Admin', 'Super Admin'));
router.get('/pages', getStaticPages);
router.post('/pages', createStaticPage);
router.put('/pages/:id', updateStaticPage);
router.delete('/pages/:id', deleteStaticPage);

// Public route for reading pages
router.get('/pages/public/:slug', getStaticPageBySlug);

// ==================== MEDIA ROUTES ====================
// Admin routes
router.use('/media', authorize('Admin', 'Super Admin'));
router.get('/media', getMedia);
router.post('/media/upload', upload.single('file'), uploadMedia);
router.delete('/media/:id', deleteMedia);

// ==================== FAQ ROUTES ====================
// Admin routes
router.use('/faqs', authorize('Admin', 'Super Admin'));
router.get('/faqs', getFAQs);
router.post('/faqs', createFAQ);
router.put('/faqs/:id', updateFAQ);
router.delete('/faqs/:id', deleteFAQ);

// Public route for reading FAQs
router.get('/faqs/public/:category', getPublishedFAQs);

// ==================== BANNER ROUTES ====================
// Admin/Super Admin only
router.use('/banners', authorize('Admin', 'Super Admin'));
router.get('/banners', getBanners);
router.post('/banners', createBanner);
router.put('/banners/:id', updateBanner);
router.delete('/banners/:id', deleteBanner);

module.exports = router;