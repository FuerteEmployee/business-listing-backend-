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

const { protect, authorize, attachOwnedBrands } = require('../middleware/authMiddleware');

// All routes require authentication
router.use(protect);
router.use(attachOwnedBrands);

// ==================== DASHBOARD ====================
router.get('/dashboard', authorize('Brand Owner', 'Company Owner'), getMerchantDashboard);

// ==================== PRODUCTS ====================
router.route('/products')
    .get(authorize('Brand Owner', 'Company Owner'), getMerchantProducts)
    .post(authorize('Brand Owner', 'Company Owner'), createMerchantProduct);

router.route('/products/:productId')
    .put(authorize('Brand Owner', 'Company Owner'), updateMerchantProduct)
    .delete(authorize('Brand Owner', 'Company Owner'), deleteMerchantProduct);

router.post('/products/:productId/submit', authorize('Brand Owner', 'Company Owner'), submitProductForApproval);

// ==================== SERVICES ====================
router.route('/services')
    .get(authorize('Brand Owner', 'Company Owner'), getMerchantServices)
    .post(authorize('Brand Owner', 'Company Owner'), createMerchantService);

router.route('/services/:serviceId')
    .put(authorize('Brand Owner', 'Company Owner'), updateMerchantService);

// ==================== ORDERS ====================
router.get('/orders', authorize('Brand Owner', 'Company Owner'), getMerchantOrders);
router.get('/orders/:orderId', authorize('Brand Owner', 'Company Owner'), getMerchantOrderDetails);
router.put('/orders/:orderId/status', authorize('Brand Owner', 'Company Owner'), updateOrderStatus);

// ==================== INVENTORY ====================
router.get('/inventory/alerts', authorize('Brand Owner', 'Company Owner'), getLowStockAlerts);
router.put('/inventory/products/:productId/stock', authorize('Brand Owner', 'Company Owner'), updateProductStock);

// ==================== ANALYTICS ====================
router.get('/analytics', authorize('Brand Owner', 'Company Owner'), getMerchantAnalytics);

// ==================== ADMIN ROUTES ====================
// Admin can access any merchant's data
router.get('/admin/:merchantId/dashboard', authorize('Super Admin', 'Admin'), getMerchantDashboard);
router.get('/admin/:merchantId/products', authorize('Super Admin', 'Admin'), getMerchantProducts);
router.get('/admin/:merchantId/services', authorize('Super Admin', 'Admin'), getMerchantServices);
router.get('/admin/:merchantId/orders', authorize('Super Admin', 'Admin'), getMerchantOrders);
router.get('/admin/:merchantId/analytics', authorize('Super Admin', 'Admin'), getMerchantAnalytics);

module.exports = router;