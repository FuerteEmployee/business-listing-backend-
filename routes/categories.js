const express = require('express');
const router = express.Router();
const { getAllCategories, createCategory, updateCategory, deleteCategory, getCategoryBySlug } = require('../controllers/categoryController');
const { protect, authorize, attachOwnedBrands } = require('../middleware/authMiddleware');

// Public routes
router.get('/', (req, res, next) => {
    const { protect, attachOwnedBrands } = require('../middleware/authMiddleware');
    if (req.headers.authorization) {
        return protect(req, res, (err) => {
            if (err) return next(); // Ignore auth errors for public route
            attachOwnedBrands(req, res, next);
        });
    }
    next();
}, getAllCategories);
router.get('/slug/:slug', getCategoryBySlug);

router.post('/', protect, authorize('Super Admin', 'Brand Owner', 'Company Owner', 'Merchant', 'owner', 'Owner', 'OWNER'), attachOwnedBrands, createCategory);
router.put('/:id', protect, authorize('Super Admin', 'Brand Owner', 'Company Owner', 'Merchant', 'owner', 'Owner', 'OWNER'), attachOwnedBrands, updateCategory);
router.delete('/:id', protect, authorize('Super Admin', 'Brand Owner', 'Company Owner', 'Merchant', 'owner', 'Owner', 'OWNER'), attachOwnedBrands, deleteCategory);

module.exports = router;
