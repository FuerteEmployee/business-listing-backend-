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
router.get('/dashboard', authorize('Brand Owner', 'Company Owner', 'Merchant', 'owner', 'Owner', 'OWNER'), getMerchantDashboard);

// ==================== PRODUCTS ====================
router.route('/products')
    .get(authorize('Brand Owner', 'Company Owner', 'Merchant', 'owner', 'Owner', 'OWNER'), getMerchantProducts)
    .post(authorize('Brand Owner', 'Company Owner', 'Merchant', 'owner', 'Owner', 'OWNER'), createMerchantProduct);

router.route('/products/:productId')
    .put(authorize('Brand Owner', 'Company Owner', 'Merchant', 'owner', 'Owner', 'OWNER'), updateMerchantProduct)
    .delete(authorize('Brand Owner', 'Company Owner', 'Merchant', 'owner', 'Owner', 'OWNER'), deleteMerchantProduct);

router.post('/products/:productId/submit', authorize('Brand Owner', 'Company Owner', 'Merchant', 'owner', 'Owner', 'OWNER'), submitProductForApproval);

// ==================== SERVICES ====================
router.route('/services')
    .get(authorize('Brand Owner', 'Company Owner', 'Merchant', 'owner', 'Owner', 'OWNER'), getMerchantServices)
    .post(authorize('Brand Owner', 'Company Owner', 'Merchant', 'owner', 'Owner', 'OWNER'), createMerchantService);

router.route('/services/:serviceId')
    .put(authorize('Brand Owner', 'Company Owner', 'Merchant', 'owner', 'Owner', 'OWNER'), updateMerchantService);

// ==================== ORDERS ====================
router.get('/orders', authorize('Brand Owner', 'Company Owner', 'Merchant', 'owner', 'Owner', 'OWNER'), getMerchantOrders);
router.get('/orders/:orderId', authorize('Brand Owner', 'Company Owner', 'Merchant', 'owner', 'Owner', 'OWNER'), getMerchantOrderDetails);
router.put('/orders/:orderId/status', authorize('Brand Owner', 'Company Owner', 'Merchant', 'owner', 'Owner', 'OWNER'), updateOrderStatus);

// ==================== INVENTORY ====================
router.get('/inventory/alerts', authorize('Brand Owner', 'Company Owner', 'Merchant', 'owner', 'Owner', 'OWNER'), getLowStockAlerts);
router.put('/inventory/products/:productId/stock', authorize('Brand Owner', 'Company Owner', 'Merchant', 'owner', 'Owner', 'OWNER'), updateProductStock);

// ==================== ANALYTICS ====================
router.get('/analytics', authorize('Brand Owner', 'Company Owner', 'Merchant', 'owner', 'Owner', 'OWNER'), getMerchantAnalytics);

// ==================== ADMIN ROUTES ====================
// Admin can access any merchant's data
router.get('/admin/:merchantId/dashboard', authorize('Super Admin', 'Admin'), getMerchantDashboard);
router.get('/admin/:merchantId/products', authorize('Super Admin', 'Admin'), getMerchantProducts);
router.get('/admin/:merchantId/services', authorize('Super Admin', 'Admin'), getMerchantServices);
router.get('/admin/:merchantId/orders', authorize('Super Admin', 'Admin'), getMerchantOrders);
router.get('/admin/:merchantId/analytics', authorize('Super Admin', 'Admin'), getMerchantAnalytics);

module.exports = router;