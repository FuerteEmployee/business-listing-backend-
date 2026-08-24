const Product = require('../models/Product');
const slugify = require('slugify');
const { isBrandScoped, ownsBrand } = require('../middleware/authMiddleware');

// Get all products
exports.getProducts = async (req, res) => {
    try {
        const { listingId, categoryId, status, isFeatured, limit } = req.query;
        let query = {};

        if (listingId) query.listingId = listingId;
        if (categoryId) query.categoryId = categoryId;
        if (status) query.status = status;
        if (isFeatured === 'true') query.featured = true;

        // Scoping: an owner only ever sees products of the brands they own.
        // A requested listingId is honoured only when they own it, so filtering by
        // one of their own brands still works while other brands stay invisible.
        if (req.user && (isBrandScoped(req.user) || req.query.owned === 'true')) {
            query.listingId = ownsBrand(req, listingId)
                ? listingId
                : { $in: req.ownedBrandIds || [] };
        }

        let dbQuery = Product.find(query)
            .populate('listingId', 'name slug')
            .populate('categoryId', 'name')
            .sort({ displayOrder: 1, createdAt: -1 });

        if (limit) {
            dbQuery = dbQuery.limit(parseInt(limit));
        }

        const products = await dbQuery;

        res.status(200).json({
            success: true,
            count: products.length,
            data: products
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// Bulk reorder products
exports.reorderProducts = async (req, res) => {
    try {
        const { orders } = req.body; // Array of { id, displayOrder }
        
        const bulkOps = orders.map(item => ({
            updateOne: {
                filter: { _id: item.id },
                update: { displayOrder: item.displayOrder }
            }
        }));

        await Product.bulkWrite(bulkOps);

        res.status(200).json({ success: true, msg: 'Reordered successfully' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// Get single product
exports.getProduct = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id)
            .populate('listingId', 'name slug')
            .populate('categoryId', 'name')
            .populate('subCategoryId', 'name')
            .populate('brandId', 'name');

        if (!product) {
            return res.status(404).json({ success: false, error: 'Product not found' });
        }

        // Multi-tenancy isolation: block access for tenants if the product belongs to another company.
        // Mirrors the scoping used in updateProduct/deleteProduct rather than a hand-rolled role
        // check, so it also covers 'Merchant' and the lowercase owner/Owner/OWNER role spellings.
        if (isBrandScoped(req.user)) {
            const listingId = product.listingId?._id || product.listingId;
            if (!ownsBrand(req, listingId)) {
                return res.status(403).json({ success: false, error: 'Access Denied: You do not own this product' });
            }
        }

        res.status(200).json({ success: true, data: product });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// @desc    Get product by slug
// @route   GET /api/products/slug/:slug
exports.getProductBySlug = async (req, res) => {
    try {
        const product = await Product.findOne({ slug: req.params.slug, status: 'Active' })
            // rating/reviewCount drive the seller rating shown on the product page, and
            // city_id needs its own populate or the city renders as a bare ObjectId.
            .populate({
                path: 'listingId',
                // logo is the seller's brand mark and is often set when image is not,
                // so the product page needs both to render the seller avatar.
                select: 'name slug phone email image logo address city_id state_id area_id rating reviewCount',
                populate: { path: 'city_id', select: 'name' }
            })
            .populate('categoryId', 'name')
            .populate('subCategoryId', 'name')
            .populate('brandId', 'name');

        if (!product) {
            return res.status(404).json({ success: false, error: 'Product not found' });
        }

        // Get similar products from the same category
        const similarProducts = await Product.find({
            categoryId: product.categoryId._id,
            _id: { $ne: product._id },
            status: 'Active'
        })
        .limit(6)
        .populate('listingId', 'name slug rating reviewCount')
        .select('name slug price images description');

        res.status(200).json({ 
            success: true, 
            data: product,
            similarProducts: similarProducts
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// Create new product
exports.createProduct = async (req, res) => {
    try {
        console.log('--- createProduct HIT ---');
        console.log('req.user:', req.user);
        console.log('req.body:', req.body);

        // Add user ID to request body
        req.body.createdBy = req.user.id;
        
        if (req.body.subCategoryId === '') delete req.body.subCategoryId;
        if (req.body.brandId === '') delete req.body.brandId;
        
        // Auto-generate slug if not provided
        if (req.body.name && !req.body.slug) {
            req.body.slug = slugify(req.body.name, { lower: true, strict: true });
        }

        // Validation for brand owners: the product must belong to one of their brands.
        // A client that sends no listingId falls back to the user's own company.
        if (isBrandScoped(req.user)) {
            if (!req.body.listingId) {
                req.body.listingId = req.user.companyId || req.user.company;
            }
            if (!ownsBrand(req, req.body.listingId)) {
                return res.status(403).json({ success: false, error: 'Not authorized to add product to this brand' });
            }
        }

        // companyId mirrors listingId so both tenancy fields agree on new products
        if (req.body.listingId && !req.body.companyId) {
            req.body.companyId = req.body.listingId;
        }

        const product = await Product.create(req.body);

        // Log to AdminAuditLog
        try {
            const AdminAuditLog = require('../models/AdminAuditLog');
            await AdminAuditLog.create({
                adminId: req.user.id,
                action: 'PRODUCT_CREATED',
                targetType: 'Product',
                targetId: product._id,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent'],
                notes: `${req.user.name} created product '${product.name}'`
            });
        } catch (auditErr) {
            console.error('Failed to log product creation audit:', auditErr.message);
        }

        res.status(201).json({
            success: true,
            data: product
        });
    } catch (error) {
        // Handle Mongoose duplicate key error (11000) for SKU/Slug
        if (error.code === 11000) {
            const field = Object.keys(error.keyValue)[0];
            return res.status(400).json({ success: false, error: `Duplicate error: ${field} already exists.` });
        }
        res.status(400).json({ success: false, error: error.message });
    }
};

// Update product
exports.updateProduct = async (req, res) => {
    try {
        req.body.updatedBy = req.user.id;

        if (req.body.subCategoryId === '') req.body.subCategoryId = null;
        if (req.body.brandId === '') req.body.brandId = null;

        // Auto-generate slug if name is updated but slug isn't provided
        if (req.body.name && !req.body.slug) {
            req.body.slug = slugify(req.body.name, { lower: true, strict: true });
        }

        let product = await Product.findById(req.params.id);
        if (!product) {
            return res.status(404).json({ success: false, error: 'Product not found' });
        }

        // Authorization check for brand owners
        if (isBrandScoped(req.user)) {
            if (!ownsBrand(req, product.listingId)) {
                return res.status(403).json({ success: false, error: 'Not authorized to update this product' });
            }
            // Also prevent changing listingId to a brand they don't own
            if (req.body.listingId && !ownsBrand(req, req.body.listingId)) {
                return res.status(403).json({ success: false, error: 'Not authorized to move product to this brand' });
            }
        }

        // Keep companyId in step with listingId whenever the brand is reassigned
        if (req.body.listingId) {
            req.body.companyId = req.body.listingId;
        }

        // Capture changes for audit log
        try {
            const trackFields = ['name', 'description', 'price', 'images', 'status'];
            const before = {};
            const after = {};
            const fieldChanged = [];
            trackFields.forEach(field => {
                if (req.body[field] !== undefined && String(req.body[field]) !== String(product[field])) {
                    before[field] = product[field];
                    after[field] = req.body[field];
                    fieldChanged.push(field);
                }
            });
            if (fieldChanged.length > 0) {
                const AdminAuditLog = require('../models/AdminAuditLog');
                await AdminAuditLog.create({
                    adminId: req.user.id,
                    action: 'PRODUCT_UPDATED',
                    targetType: 'Product',
                    targetId: product._id,
                    changes: { before, after, fieldChanged },
                    ipAddress: req.ip,
                    userAgent: req.headers['user-agent'],
                    notes: `${req.user.name} updated product '${product.name}'`
                });
            }
        } catch (auditErr) {
            console.error('Failed to log product update audit:', auditErr.message);
        }

        product = await Product.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true
        });

        res.status(200).json({ success: true, data: product });
    } catch (error) {
         if (error.code === 11000) {
            const field = Object.keys(error.keyValue)[0];
            return res.status(400).json({ success: false, error: `Duplicate error: ${field} already exists.` });
        }
        res.status(400).json({ success: false, error: error.message });
    }
};

// Delete product
exports.deleteProduct = async (req, res) => {
    try {
        let product = await Product.findById(req.params.id);
        if (!product) {
            return res.status(404).json({ success: false, error: 'Product not found' });
        }

        // Authorization check for brand owners
        if (isBrandScoped(req.user) && !ownsBrand(req, product.listingId)) {
            return res.status(403).json({ success: false, error: 'Not authorized to delete this product' });
        }

        // Log to AdminAuditLog
        try {
            const AdminAuditLog = require('../models/AdminAuditLog');
            await AdminAuditLog.create({
                adminId: req.user.id,
                action: 'PRODUCT_DELETED',
                targetType: 'Product',
                targetId: product._id,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent'],
                notes: `${req.user.name} deleted product '${product.name}'`
            });
        } catch (auditErr) {
            console.error('Failed to log product delete audit:', auditErr.message);
        }

        await Product.findByIdAndDelete(req.params.id);

        res.status(200).json({ success: true, data: {} });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};
