const Product = require('../models/Product');
const slugify = require('slugify');

// Get all products
exports.getProducts = async (req, res) => {
    try {
        const { listingId, categoryId, status, isFeatured, limit } = req.query;
        let query = {};

        if (categoryId) query.categoryId = categoryId;
        if (status) query.status = status;
        if (isFeatured === 'true') query.featured = true;

        // Scoping / Multi-tenancy isolation
        if (req.user && req.user.role !== 'Super Admin') {
            const userCompanyId = req.user.companyId || req.user.company;
            if (!userCompanyId) {
                return res.status(200).json({
                    success: true,
                    count: 0,
                    data: []
                });
            }
            query.$or = [
                { companyId: userCompanyId },
                { listingId: userCompanyId }
            ];
        } else if (listingId) {
            query.listingId = listingId;
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

        // Multi-tenancy isolation: block access for tenants if the product belongs to another company
        if (req.user && req.user.role !== 'Super Admin') {
            const productCompanyId = product.companyId ? product.companyId.toString() : (product.listingId ? product.listingId.toString() : null);
            const userCompanyId = req.user.companyId ? req.user.companyId.toString() : (req.user.company ? req.user.company.toString() : null);
            
            // Only enforce this on Brand / Company Owners (tenants)
            if (req.user.role === 'Brand Owner' || req.user.role === 'Company Owner') {
                if (productCompanyId !== userCompanyId) {
                    return res.status(403).json({ success: false, error: 'Access Denied: You do not own this product' });
                }
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

        // Multi-tenancy auto-assignment of companyId
        if (req.user.role !== 'Super Admin') {
            const userCompanyId = req.user.companyId || req.user.company;
            if (!userCompanyId) {
                return res.status(400).json({ success: false, error: 'User does not belong to any company' });
            }
            req.body.companyId = userCompanyId;
            req.body.listingId = userCompanyId; // Ensure required listingId matches
        } else {
            // For Super Admin, ensure companyId is set if listingId is provided
            if (req.body.listingId && !req.body.companyId) {
                req.body.companyId = req.body.listingId;
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

        // Multi-tenancy isolation check: verify companyId before allowing update
        if (req.user.role !== 'Super Admin') {
            const productCompanyId = product.companyId ? product.companyId.toString() : (product.listingId ? product.listingId.toString() : null);
            const userCompanyId = req.user.companyId ? req.user.companyId.toString() : (req.user.company ? req.user.company.toString() : null);
            
            if (productCompanyId !== userCompanyId) {
                return res.status(403).json({ success: false, error: 'Access Denied: You do not own this product' });
            }
            
            // Auto-assign and lock companyId and listingId to the user's company
            req.body.companyId = userCompanyId;
            req.body.listingId = userCompanyId;
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

        // Multi-tenancy isolation check: verify companyId before allowing delete
        if (req.user.role !== 'Super Admin') {
            const productCompanyId = product.companyId ? product.companyId.toString() : (product.listingId ? product.listingId.toString() : null);
            const userCompanyId = req.user.companyId ? req.user.companyId.toString() : (req.user.company ? req.user.company.toString() : null);
            
            if (productCompanyId !== userCompanyId) {
                return res.status(403).json({ success: false, error: 'Access Denied: You do not own this product' });
            }
        }

        await Product.findByIdAndDelete(req.params.id);

        res.status(200).json({ success: true, data: {} });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};
