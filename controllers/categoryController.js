const Category = require('../models/Category');
const Company = require('../models/Company');
const { isBrandScoped, ownsBrand } = require('../middleware/authMiddleware');

// Recompute a parent's subCount from the actual children instead of $inc-ing the cached
// value. Any drift from direct DB writes (seed/migration scripts) self-heals on next touch.
const syncSubCount = async (parentId) => {
    if (!parentId) return;
    const count = await Category.countDocuments({ parent: parentId });
    await Category.findByIdAndUpdate(parentId, { $set: { subCount: count } });
};

// @desc    Get all categories
// @route   GET /api/categories
const getAllCategories = async (req, res) => {
    try {
        const { parentId } = req.query;
        let query = {};
        if (parentId) {
            query.parent = parentId === 'null' ? null : parentId;
        }

        const isPlatformAdmin = req.user
            && ['Admin', 'Developer', 'Super Admin'].includes(req.user.role);

        if (isBrandScoped(req.user)) {
            // Brand owners manage their own categories, so they must see them at any status -
            // filtering those to Active would hide a category they just deactivated and leave
            // no way to reactivate it. Global categories stay Active-only: they aren't theirs to manage.
            query.$or = [
                { brandId: null, status: 'Active' },
                { brandId: { $in: req.ownedBrandIds || [] } }
            ];
        } else if (!isPlatformAdmin) {
            // Public / regular logged-in users only ever see live categories.
            query.status = 'Active';
        }

        const categories = await Category.find(query).sort({ createdAt: -1 });

        // subCount (models/Category.js) is a global count of ALL children regardless of
        // who can see them - accurate for an admin, but misleading for anyone else. A
        // brand owner would see e.g. "2 sub-categories" on a shared global category, click
        // in, and find nothing, because both children actually belong to two OTHER
        // brands and the list query above correctly hides them. Recompute the number
        // shown using the exact same visibility rule as that query, scoped per viewer.
        if (!isPlatformAdmin) {
            const scopeFilter = isBrandScoped(req.user)
                ? { $or: [{ brandId: null, status: 'Active' }, { brandId: { $in: req.ownedBrandIds || [] } }] }
                : { status: 'Active' };

            await Promise.all(categories.map(async (cat) => {
                cat.subCount = await Category.countDocuments({ parent: cat._id, ...scopeFilter });
            }));
        }

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

        // Brand owners may only create categories under a brand they own
        let finalBrandId = brandId || null;
        if (isBrandScoped(req.user)) {
            if (!brandId) {
                return res.status(400).json({ msg: 'Brand ID is required for brand-specific categories' });
            }
            if (!ownsBrand(req, brandId)) {
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

        await syncSubCount(parent);

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

        // Walk up from the proposed parent: if this category appears anywhere in that
        // ancestor chain, the move would close a loop. Checking only `parent === categoryId`
        // catches self-parenting but misses A -> B -> A and anything deeper, which would
        // then infinite-loop breadcrumb/ancestor traversal.
        if (parent) {
            let ancestorId = parent;
            const visited = new Set();
            while (ancestorId) {
                const key = ancestorId.toString();
                if (key === categoryId.toString()) {
                    return res.status(400).json({ msg: 'That parent is a descendant of this category - it would create a loop' });
                }
                // Guard against a pre-existing corrupt cycle so this walk always terminates.
                if (visited.has(key)) break;
                visited.add(key);

                const ancestor = await Category.findById(ancestorId).select('parent').lean();
                if (!ancestor) break;
                ancestorId = ancestor.parent;
            }
        }

        // Brand owners may only touch their own brand categories, never global ones
        if (isBrandScoped(req.user) && !ownsBrand(req, category.brandId)) {
            return res.status(403).json({ msg: 'Not authorized to update this category' });
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

        // Resync both sides if the parent changed
        if (oldParent?.toString() !== parent?.toString()) {
            await syncSubCount(oldParent);
            await syncSubCount(parent);
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

        // Brand owners may only touch their own brand categories, never global ones
        if (isBrandScoped(req.user) && !ownsBrand(req, category.brandId)) {
            return res.status(403).json({ msg: 'Not authorized to delete this category' });
        }

        // Count children live rather than trusting the cached `subCount`. That counter is
        // maintained by hand across three handlers and drifts whenever a seed/migration
        // script writes directly - a stale-high value blocks deleting a childless category,
        // a stale-low one lets a category with real children through and orphans them.
        const childCount = await Category.countDocuments({ parent: category._id });
        if (childCount > 0) {
            return res.status(400).json({ msg: `Cannot delete category with ${childCount} subcategor${childCount === 1 ? 'y' : 'ies'}` });
        }

        // Listings referencing this category would keep a dangling category_id, which
        // populate() silently resolves to null - the listing shows a blank category with
        // no sign anything was removed. Refuse instead, and say how many are affected.
        const listingCount = await Company.countDocuments({ category_id: category._id });
        if (listingCount > 0) {
            return res.status(400).json({
                msg: `Cannot delete: ${listingCount} listing${listingCount === 1 ? '' : 's'} still assigned to this category. Reassign them first.`
            });
        }

        const parent = category.parent;

        await Category.findByIdAndDelete(req.params.id);

        await syncSubCount(parent);

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
