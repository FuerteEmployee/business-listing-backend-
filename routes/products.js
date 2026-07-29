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

const { protect, authorize, attachOwnedBrands } = require('../middleware/authMiddleware');

// Public routes
router.route('/').get(getProducts);
router.route('/slug/:slug').get(getProductBySlug);
router.route('/:id').get(getProduct);

// Protected routes (Admin / Brand Owner)
router.use(protect);
router.use(authorize('Super Admin', 'Brand Owner', 'Company Owner'));
router.use(attachOwnedBrands);

router.route('/').post(createProduct);
router.patch('/reorder', reorderProducts);
router.route('/:id')
    .put(updateProduct)
    .delete(deleteProduct);

module.exports = router;
