const Category = require('../models/Category');

// @desc    Get all categories
// @route   GET /api/categories
const getAllCategories = async (req, res) => {
    try {
        const { parentId } = req.query;
        let query = {};
        if (parentId) {
            query.parent = parentId === 'null' ? null : parentId;
        }

        // Scoping for Brand Owner: show global categories OR their own brand categories
        if (req.user && (req.user.role === 'Brand Owner' || req.user.role === 'Company Owner')) {
            query.$or = [
                { brandId: null },
                { brandId: { $in: req.ownedBrandIds || [] } }
            ];
        }

        // 0. Enforce Active status for public requests
        if (!req.user || (req.user.role !== 'Admin' && req.user.role !== 'Developer' && req.user.role !== 'Super Admin')) {
            query.status = 'Active';
        }

        const categories = await Category.find(query).sort({ createdAt: -1 });
        res.json(categories);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
};

// @desc    Create a new category
// @route   POST /api/categories
const createCategory = async (req, res) => {
    try {
        const { name, slug, image, status, parent, brandId } = req.body;

        let category = await Category.findOne({ slug });
        if (category) {
            return res.status(400).json({ msg: 'Category with this slug already exists' });
        }

        // Authorization check for Brand Owner
        let finalBrandId = brandId || null;
        if (req.user.role === 'Brand Owner' || req.user.role === 'Company Owner') {
            if (!brandId) {
                return res.status(400).json({ msg: 'Brand ID is required for brand-specific categories' });
            }
            if (!req.ownedBrandIds.map(id => id.toString()).includes(brandId)) {
                return res.status(403).json({ msg: 'Not authorized to create category for this brand' });
            }
            finalBrandId = brandId;
        }

        category = new Category({
            name,
            slug,
            image,
            status,
            parent: parent || null,
            brandId: finalBrandId
        });

        await category.save();

        // Increment subCount of parent if exists
        if (parent) {
            await Category.findByIdAndUpdate(parent, { $inc: { subCount: 1 } });
        }

        res.status(201).json(category);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
};

// @desc    Update a category
// @route   PUT /api/categories/:id
const updateCategory = async (req, res) => {
    try {
        const { name, slug, image, status, parent } = req.body;
        const categoryId = req.params.id;

        if (parent === categoryId) {
            return res.status(400).json({ msg: 'A category cannot be its own parent' });
        }

        let category = await Category.findById(categoryId);
        if (!category) return res.status(404).json({ msg: 'Category not found' });

        // Authorization check for Brand Owner
        if (req.user.role === 'Brand Owner' || req.user.role === 'Company Owner') {
            if (!category.brandId || !req.ownedBrandIds.map(id => id.toString()).includes(category.brandId.toString())) {
                return res.status(403).json({ msg: 'Not authorized to update this category' });
            }
        }
        const oldParent = category.parent;

        const categoryFields = {};
        if (name) categoryFields.name = name;
        if (slug) categoryFields.slug = slug;
        if (image !== undefined) categoryFields.image = image;
        if (status) categoryFields.status = status;
        categoryFields.parent = parent || null;

        category = await Category.findByIdAndUpdate(
            categoryId,
            { $set: categoryFields },
            { new: true }
        );

        // Update subCounts if parent changed
        if (oldParent?.toString() !== parent?.toString()) {
            if (oldParent) {
                await Category.findByIdAndUpdate(oldParent, { $inc: { subCount: -1 } });
            }
            if (parent) {
                await Category.findByIdAndUpdate(parent, { $inc: { subCount: 1 } });
            }
        }

        res.json(category);
    } catch (err) {
        console.error(err.message);
        if (err.kind === 'ObjectId') return res.status(404).json({ msg: 'Category not found' });
        res.status(500).json({ msg: 'Server Error' });
    }
};

// @desc    Delete a category
// @route   DELETE /api/categories/:id
const deleteCategory = async (req, res) => {
    try {
        const category = await Category.findById(req.params.id);
        if (!category) return res.status(404).json({ msg: 'Category not found' });

        // Authorization check for Brand Owner
        if (req.user.role === 'Brand Owner' || req.user.role === 'Company Owner') {
            if (!category.brandId || !req.ownedBrandIds.map(id => id.toString()).includes(category.brandId.toString())) {
                return res.status(403).json({ msg: 'Not authorized to delete this category' });
            }
        }
        // Block deletion if subcategories exist
        if (category.subCount > 0) {
            return res.status(400).json({ msg: 'Cannot delete category with subcategories' });
        }

        const parent = category.parent;

        await Category.findByIdAndDelete(req.params.id);

        // Decrement subCount of parent if exists
        if (parent) {
            await Category.findByIdAndUpdate(parent, { $inc: { subCount: -1 } });
        }

        res.json({ msg: 'Category removed' });
    } catch (err) {
        console.error(err.message);
        if (err.kind === 'ObjectId') return res.status(404).json({ msg: 'Category not found' });
        res.status(500).json({ msg: 'Server Error' });
    }
};

// @desc    Get category by slug
// @route   GET /api/categories/slug/:slug
const getCategoryBySlug = async (req, res) => {
    try {
        const category = await Category.findOne({ slug: req.params.slug.toLowerCase() });
        if (!category) return res.status(404).json({ msg: 'Category not found' });
        res.json(category);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
};

module.exports = { getAllCategories, createCategory, updateCategory, deleteCategory, getCategoryBySlug };
