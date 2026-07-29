const Product = require('../models/Product');
const slugify = require('slugify');

// Get all products
exports.getProducts = async (req, res) => {
    try {
        const { listingId, categoryId, status, isFeatured, limit } = req.query;
        let query = {};

        if (listingId) query.listingId = listingId;
        if (categoryId) query.categoryId = categoryId;
        if (status) query.status = status;
        if (isFeatured === 'true') query.featured = true;

        // Scoping for Brand Owner / Dashboard
        if (req.user) {
            const isOwner = req.user.role === 'Brand Owner' || req.user.role === 'Company Owner';
            const forceOwned = req.query.owned === 'true';

            if (forceOwned || isOwner) {
                query.listingId = { $in: req.ownedBrandIds || [] };
            }
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
            .populate('listingId', 'name slug phone email image address city_id state_id area_id')
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
        .populate('listingId', 'name slug')
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
        // Add user ID to request body
        req.body.createdBy = req.user.id;
        
        if (req.body.subCategoryId === '') delete req.body.subCategoryId;
        if (req.body.brandId === '') delete req.body.brandId;
        
        // Auto-generate slug if not provided
        if (req.body.name && !req.body.slug) {
            req.body.slug = slugify(req.body.name, { lower: true, strict: true });
        }

        // Validation for Brand Owner: must belong to their brand
        if (req.user.role === 'Brand Owner' || req.user.role === 'Company Owner') {
            if (!req.ownedBrandIds.map(id => id.toString()).includes(req.body.listingId)) {
                return res.status(403).json({ success: false, error: 'Not authorized to add product to this brand' });
            }
        }
        
        const product = await Product.create(req.body);

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

        // Authorization check for Brand Owner
        if (req.user.role === 'Brand Owner' || req.user.role === 'Company Owner') {
            if (!req.ownedBrandIds.map(id => id.toString()).includes(product.listingId.toString())) {
                return res.status(403).json({ success: false, error: 'Not authorized to update this product' });
            }
            // Also prevent changing listingId to a brand they don't own
            if (req.body.listingId && !req.ownedBrandIds.map(id => id.toString()).includes(req.body.listingId)) {
                return res.status(403).json({ success: false, error: 'Not authorized to move product to this brand' });
            }
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

        // Authorization check for Brand Owner
        if ((req.user.role === 'Brand Owner' || req.user.role === 'Company Owner') && !req.ownedBrandIds.map(id => id.toString()).includes(product.listingId.toString())) {
            return res.status(403).json({ success: false, error: 'Not authorized to delete this product' });
        }

        await Product.findByIdAndDelete(req.params.id);

        res.status(200).json({ success: true, data: {} });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};
