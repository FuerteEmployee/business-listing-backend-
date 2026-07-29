const Article = require('../models/Article');
const StaticPage = require('../models/StaticPage');
const Media = require('../models/Media');
const FAQ = require('../models/FAQ');
const Banner = require('../models/Banner');
const { cloudinary } = require('../config/cloudinary');

// ==================== ARTICLE MANAGEMENT ====================

// Get all articles with pagination and filtering
const getArticles = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            status,
            category,
            author,
            search,
            sortBy = 'createdAt',
            sortOrder = 'desc'
        } = req.query;

        let query = {};

        // 0. Enforce Published status for public requests
        if (!req.user || (req.user.role !== 'Admin' && req.user.role !== 'Developer')) {
            query.status = 'published';
        }

        // Apply filters
        if (status) query.status = status;
        if (category) query.category = category;
        if (author) query.author = author;
        if (search) {
            query.$or = [
                { title: { $regex: search, $options: 'i' } },
                { content: { $regex: search, $options: 'i' } },
                { tags: { $in: [new RegExp(search, 'i')] } }
            ];
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const sort = {};
        sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

        const articles = await Article.find(query)
            .populate('author', 'name email')
            .sort(sort)
            .skip(skip)
            .limit(parseInt(limit));

        const total = await Article.countDocuments(query);

        res.json({
            success: true,
            articles,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (err) {
        console.error('Error fetching articles:', err);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// Get single article by slug
const getArticleBySlug = async (req, res) => {
    try {
        const { slug } = req.params;

        const article = await Article.findOneAndUpdate(
            { slug, status: 'published' },
            { $inc: { viewCount: 1 } },
            { new: true }
        ).populate('author', 'name email');

        if (!article) {
            return res.status(404).json({ success: false, msg: 'Article not found' });
        }

        res.json({ success: true, article });
    } catch (err) {
        console.error('Error fetching article:', err);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// Create new article
const createArticle = async (req, res) => {
    try {
        const articleData = {
            ...req.body,
            author: req.user._id
        };

        // Set published date if status is published
        if (articleData.status === 'published' && !articleData.publishedAt) {
            articleData.publishedAt = new Date();
        }

        const article = new Article(articleData);
        await article.save();
        await article.populate('author', 'name email');

        res.status(201).json({ success: true, article });
    } catch (err) {
        console.error('Error creating article:', err);
        if (err.code === 11000) {
            return res.status(400).json({ success: false, msg: 'Article slug already exists' });
        }
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// Update article
const updateArticle = async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body;

        // Set published date if status changed to published
        if (updateData.status === 'published') {
            const existingArticle = await Article.findById(id);
            if (existingArticle && existingArticle.status !== 'published') {
                updateData.publishedAt = new Date();
            }
        }

        const article = await Article.findByIdAndUpdate(
            id,
            updateData,
            { new: true, runValidators: true }
        ).populate('author', 'name email');

        if (!article) {
            return res.status(404).json({ success: false, msg: 'Article not found' });
        }

        res.json({ success: true, article });
    } catch (err) {
        console.error('Error updating article:', err);
        if (err.code === 11000) {
            return res.status(400).json({ success: false, msg: 'Article slug already exists' });
        }
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// Delete article
const deleteArticle = async (req, res) => {
    try {
        const { id } = req.params;

        const article = await Article.findByIdAndDelete(id);

        if (!article) {
            return res.status(404).json({ success: false, msg: 'Article not found' });
        }

        res.json({ success: true, message: 'Article deleted successfully' });
    } catch (err) {
        console.error('Error deleting article:', err);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// ==================== STATIC PAGE MANAGEMENT ====================

// Get all static pages
const getStaticPages = async (req, res) => {
    try {
        const { status, pageType } = req.query;

        let query = {};
        
        // 0. Enforce Published status for public requests
        if (!req.user || (req.user.role !== 'Admin' && req.user.role !== 'Developer')) {
            query.status = 'published';
        }

        if (status) query.status = status;
        if (pageType) query.pageType = pageType;

        const pages = await StaticPage.find(query)
            .populate('author', 'name email')
            .sort({ createdAt: -1 });

        res.json({ success: true, pages });
    } catch (err) {
        console.error('Error fetching static pages:', err);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// Get static page by slug
const getStaticPageBySlug = async (req, res) => {
    try {
        const { slug } = req.params;

        const page = await StaticPage.findOneAndUpdate(
            { slug, status: 'published' },
            { $inc: { viewCount: 1 } },
            { new: true }
        ).populate('author', 'name email');

        if (!page) {
            return res.status(404).json({ success: false, msg: 'Page not found' });
        }

        res.json({ success: true, page });
    } catch (err) {
        console.error('Error fetching static page:', err);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// Create static page
const createStaticPage = async (req, res) => {
    try {
        const pageData = {
            ...req.body,
            author: req.user._id
        };

        if (pageData.status === 'published' && !pageData.publishedAt) {
            pageData.publishedAt = new Date();
        }

        const page = new StaticPage(pageData);
        await page.save();
        await page.populate('author', 'name email');

        res.status(201).json({ success: true, page });
    } catch (err) {
        console.error('Error creating static page:', err);
        if (err.code === 11000) {
            return res.status(400).json({ success: false, msg: 'Page slug already exists' });
        }
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// Update static page
const updateStaticPage = async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body;

        if (updateData.status === 'published') {
            const existingPage = await StaticPage.findById(id);
            if (existingPage && existingPage.status !== 'published') {
                updateData.publishedAt = new Date();
            }
        }

        const page = await StaticPage.findByIdAndUpdate(
            id,
            updateData,
            { new: true, runValidators: true }
        ).populate('author', 'name email');

        if (!page) {
            return res.status(404).json({ success: false, msg: 'Static page not found' });
        }

        res.json({ success: true, page });
    } catch (err) {
        console.error('Error updating static page:', err);
        if (err.code === 11000) {
            return res.status(400).json({ success: false, msg: 'Page slug already exists' });
        }
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// Delete static page
const deleteStaticPage = async (req, res) => {
    try {
        const { id } = req.params;

        const page = await StaticPage.findByIdAndDelete(id);

        if (!page) {
            return res.status(404).json({ success: false, msg: 'Static page not found' });
        }

        res.json({ success: true, message: 'Static page deleted successfully' });
    } catch (err) {
        console.error('Error deleting static page:', err);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// ==================== MEDIA MANAGEMENT ====================

// Upload media file
const uploadMedia = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, msg: 'No file uploaded' });
        }

        // Upload to Cloudinary
        const result = await cloudinary.uploader.upload(req.file.path, {
            folder: 'cms-media',
            resource_type: 'auto'
        });

        // Determine media type
        let mediaType = 'other';
        if (result.resource_type === 'image') mediaType = 'image';
        else if (result.resource_type === 'video') mediaType = 'video';
        else if (result.format === 'pdf' || result.format === 'doc' || result.format === 'docx') mediaType = 'document';

        const media = new Media({
            filename: result.original_filename,
            originalName: req.file.originalname,
            mimeType: result.format,
            size: result.bytes,
            url: result.secure_url,
            publicId: result.public_id,
            mediaType,
            category: req.body.category || 'other',
            altText: req.body.altText,
            caption: req.body.caption,
            description: req.body.description,
            tags: req.body.tags ? JSON.parse(req.body.tags) : [],
            uploadedBy: req.user._id,
            dimensions: result.width && result.height ? {
                width: result.width,
                height: result.height
            } : undefined,
            folder: req.body.folder || 'general'
        });

        await media.save();
        await media.populate('uploadedBy', 'name email');

        res.status(201).json({ success: true, media });
    } catch (err) {
        console.error('Error uploading media:', err);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// Get media files
const getMedia = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 20,
            mediaType,
            category,
            folder,
            search
        } = req.query;

        let query = {};

        if (mediaType) query.mediaType = mediaType;
        if (category) query.category = category;
        if (folder) query.folder = folder;
        if (search) {
            query.$or = [
                { filename: { $regex: search, $options: 'i' } },
                { originalName: { $regex: search, $options: 'i' } },
                { tags: { $in: [new RegExp(search, 'i')] } }
            ];
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const media = await Media.find(query)
            .populate('uploadedBy', 'name email')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const total = await Media.countDocuments(query);

        res.json({
            success: true,
            media,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (err) {
        console.error('Error fetching media:', err);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// Delete media
const deleteMedia = async (req, res) => {
    try {
        const { id } = req.params;

        const media = await Media.findById(id);
        if (!media) {
            return res.status(404).json({ success: false, msg: 'Media not found' });
        }

        // Delete from Cloudinary
        await cloudinary.uploader.destroy(media.publicId);

        // Delete from database
        await Media.findByIdAndDelete(id);

        res.json({ success: true, message: 'Media deleted successfully' });
    } catch (err) {
        console.error('Error deleting media:', err);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// ==================== FAQ MANAGEMENT ====================

// Get FAQs
const getFAQs = async (req, res) => {
    try {
        const { category, status, search } = req.query;

        let query = {};
        if (category) query.category = category;
        if (status) query.status = status;
        if (search) {
            query.$or = [
                { question: { $regex: search, $options: 'i' } },
                { answer: { $regex: search, $options: 'i' } },
                { tags: { $in: [new RegExp(search, 'i')] } }
            ];
        }

        const faqs = await FAQ.find(query)
            .populate('author', 'name email')
            .sort({ category: 1, order: 1 });

        res.json({ success: true, faqs });
    } catch (err) {
        console.error('Error fetching FAQs:', err);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// Get published FAQs by category (public API)
const getPublishedFAQs = async (req, res) => {
    try {
        const { category } = req.params;

        const faqs = await FAQ.getPublishedByCategory(category);

        res.json({ success: true, faqs });
    } catch (err) {
        console.error('Error fetching published FAQs:', err);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// Create FAQ
const createFAQ = async (req, res) => {
    try {
        const faqData = {
            ...req.body,
            author: req.user._id
        };

        if (faqData.status === 'published' && !faqData.publishedAt) {
            faqData.publishedAt = new Date();
        }

        const faq = new FAQ(faqData);
        await faq.save();
        await faq.populate('author', 'name email');

        res.status(201).json({ success: true, faq });
    } catch (err) {
        console.error('Error creating FAQ:', err);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// Update FAQ
const updateFAQ = async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body;

        if (updateData.status === 'published') {
            const existingFAQ = await FAQ.findById(id);
            if (existingFAQ && existingFAQ.status !== 'published') {
                updateData.publishedAt = new Date();
            }
        }

        const faq = await FAQ.findByIdAndUpdate(
            id,
            updateData,
            { new: true, runValidators: true }
        ).populate('author', 'name email');

        if (!faq) {
            return res.status(404).json({ success: false, msg: 'FAQ not found' });
        }

        res.json({ success: true, faq });
    } catch (err) {
        console.error('Error updating FAQ:', err);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// Delete FAQ
const deleteFAQ = async (req, res) => {
    try {
        const { id } = req.params;

        const faq = await FAQ.findByIdAndDelete(id);

        if (!faq) {
            return res.status(404).json({ success: false, msg: 'FAQ not found' });
        }

        res.json({ success: true, message: 'FAQ deleted successfully' });
    } catch (err) {
        console.error('Error deleting FAQ:', err);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// ==================== BANNER MANAGEMENT ====================

// Get all banners
const getBanners = async (req, res) => {
    try {
        const { type, status } = req.query;
        let query = {};
        if (type) query.type = type;
        if (status) query.status = status;

        const banners = await Banner.find(query)
            .populate('createdBy', 'name email')
            .sort({ order: 1, createdAt: -1 });

        res.json({ success: true, banners });
    } catch (err) {
        console.error('Error fetching banners:', err);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// Create banner
const createBanner = async (req, res) => {
    try {
        const bannerData = {
            ...req.body,
            createdBy: req.user._id
        };

        const banner = new Banner(bannerData);
        await banner.save();
        await banner.populate('createdBy', 'name email');

        res.status(201).json({ success: true, banner });
    } catch (err) {
        console.error('Error creating banner:', err);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// Update banner
const updateBanner = async (req, res) => {
    try {
        const { id } = req.params;
        const banner = await Banner.findByIdAndUpdate(
            id,
            req.body,
            { new: true, runValidators: true }
        ).populate('createdBy', 'name email');

        if (!banner) {
            return res.status(404).json({ success: false, msg: 'Banner not found' });
        }

        res.json({ success: true, banner });
    } catch (err) {
        console.error('Error updating banner:', err);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// Delete banner
const deleteBanner = async (req, res) => {
    try {
        const { id } = req.params;
        const banner = await Banner.findByIdAndDelete(id);

        if (!banner) {
            return res.status(404).json({ success: false, msg: 'Banner not found' });
        }

        res.json({ success: true, message: 'Banner deleted successfully' });
    } catch (err) {
        console.error('Error deleting banner:', err);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

module.exports = {
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
};