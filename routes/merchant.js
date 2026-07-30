const express = require('express');
const router = express.Router();
const {
    getMerchantDashboard,
    getMerchantProducts,
    createMerchantProduct,
    updateMerchantProduct,
    deleteMerchantProduct,
    submitProductForApproval,
    getMerchantServices,
    createMerchantService,
    updateMerchantService,
    getMerchantOrders,
    getMerchantOrderDetails,
    updateOrderStatus,
    getLowStockAlerts,
    updateProductStock,
    getMerchantAnalytics
} = require('../controllers/merchantController');

const { protect, authorize, attachOwnedBrands, BRAND_SCOPED_ROLES } = require('../middleware/authMiddleware');

// All routes require authentication
router.use(protect);
router.use(attachOwnedBrands);

// ==================== DASHBOARD ====================
router.get('/dashboard', authorize(...BRAND_SCOPED_ROLES), getMerchantDashboard);

// ==================== PRODUCTS ====================
router.route('/products')
    .get(authorize(...BRAND_SCOPED_ROLES), getMerchantProducts)
    .post(authorize(...BRAND_SCOPED_ROLES), createMerchantProduct);

router.route('/products/:productId')
    .put(authorize(...BRAND_SCOPED_ROLES), updateMerchantProduct)
    .delete(authorize(...BRAND_SCOPED_ROLES), deleteMerchantProduct);

router.post('/products/:productId/submit', authorize(...BRAND_SCOPED_ROLES), submitProductForApproval);

// ==================== SERVICES ====================
router.route('/services')
    .get(authorize(...BRAND_SCOPED_ROLES), getMerchantServices)
    .post(authorize(...BRAND_SCOPED_ROLES), createMerchantService);

router.route('/services/:serviceId')
    .put(authorize(...BRAND_SCOPED_ROLES), updateMerchantService);

// ==================== ORDERS ====================
router.get('/orders', authorize(...BRAND_SCOPED_ROLES), getMerchantOrders);
router.get('/orders/:orderId', authorize(...BRAND_SCOPED_ROLES), getMerchantOrderDetails);
router.put('/orders/:orderId/status', authorize(...BRAND_SCOPED_ROLES), updateOrderStatus);

// ==================== INVENTORY ====================
router.get('/inventory/alerts', authorize(...BRAND_SCOPED_ROLES), getLowStockAlerts);
router.put('/inventory/products/:productId/stock', authorize(...BRAND_SCOPED_ROLES), updateProductStock);

// ==================== ANALYTICS ====================
router.get('/analytics', authorize(...BRAND_SCOPED_ROLES), getMerchantAnalytics);

// ==================== ADMIN ROUTES ====================
// Admin can access any merchant's data
router.get('/admin/:merchantId/dashboard', authorize('Super Admin', 'Admin'), getMerchantDashboard);
router.get('/admin/:merchantId/products', authorize('Super Admin', 'Admin'), getMerchantProducts);
router.get('/admin/:merchantId/services', authorize('Super Admin', 'Admin'), getMerchantServices);
router.get('/admin/:merchantId/orders', authorize('Super Admin', 'Admin'), getMerchantOrders);
router.get('/admin/:merchantId/analytics', authorize('Super Admin', 'Admin'), getMerchantAnalytics);

module.exports = router;