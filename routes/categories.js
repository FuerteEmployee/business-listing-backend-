const express = require('express');
const router = express.Router();
const { getAllCategories, createCategory, updateCategory, deleteCategory, getCategoryBySlug } = require('../controllers/categoryController');
const {
    protect,
    authorize,
    attachOwnedBrands,
    optionalAuth,
    BRAND_SCOPED_ROLES
} = require('../middleware/authMiddleware');

// Public routes. optionalAuth lets a signed-in brand owner see global categories
// plus their own, without rejecting anonymous or stale-token requests.
router.get('/', optionalAuth, getAllCategories);
router.get('/slug/:slug', getCategoryBySlug);

// Protected routes (Admin / brand owners)
router.post('/', protect, authorize('Super Admin', ...BRAND_SCOPED_ROLES), attachOwnedBrands, createCategory);
router.put('/:id', protect, authorize('Super Admin', ...BRAND_SCOPED_ROLES), attachOwnedBrands, updateCategory);
router.delete('/:id', protect, authorize('Super Admin', ...BRAND_SCOPED_ROLES), attachOwnedBrands, deleteCategory);

module.exports = router;
