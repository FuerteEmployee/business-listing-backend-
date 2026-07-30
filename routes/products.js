const express = require('express');
const router = express.Router();
const {
    getProducts,
    getProduct,
    getProductBySlug,
    createProduct,
    updateProduct,
    deleteProduct,
    reorderProducts
} = require('../controllers/productController');

const {
    protect,
    authorize,
    attachOwnedBrands,
    optionalAuth,
    BRAND_SCOPED_ROLES
} = require('../middleware/authMiddleware');

// Public routes. The listing endpoint uses optionalAuth so that a signed-in brand
// owner is scoped to their own products, while anonymous visitors still see the
// public catalogue.
router.route('/').get(optionalAuth, getProducts);
router.route('/slug/:slug').get(getProductBySlug);
router.route('/:id').get(optionalAuth, getProduct);

// Protected routes (Admin / brand owners)
router.use(protect);
router.use(authorize('Super Admin', ...BRAND_SCOPED_ROLES));
router.use(attachOwnedBrands);

router.route('/').post(createProduct);
router.patch('/reorder', reorderProducts);
router.route('/:id')
    .put(updateProduct)
    .delete(deleteProduct);

module.exports = router;
