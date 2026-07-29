const express = require('express');
const router = express.Router();
const {
    getDashboardKPIs,
    getTrafficAnalytics,
    getSearchAnalytics,
    getBusinessPerformance,
    getBusinessAnalytics,
    getBusinessAnalyticsDetailed,
    getMerchantAnalyticsOverview,
    getRevenueAnalytics,
    getUserBehaviorAnalytics,
    exportAnalytics,
    logEvent
} = require('../controllers/analyticsController');
const { protect } = require('../middleware/authMiddleware');

// ==================== DASHBOARD OVERVIEW ====================
router.get('/dashboard/kpis', protect, getDashboardKPIs);

// ==================== TRAFFIC ANALYTICS ====================
router.get('/traffic', protect, getTrafficAnalytics);

// ==================== SEARCH INTELLIGENCE ====================
router.get('/search', protect, getSearchAnalytics);

// ==================== BUSINESS PERFORMANCE ====================
router.get('/businesses/performance', protect, getBusinessPerformance);
router.get('/merchant/overview', protect, getMerchantAnalyticsOverview);
router.get('/merchant/business/:businessId', protect, getBusinessAnalyticsDetailed);
router.get('/business/:businessId/:startDate?/:endDate?', protect, getBusinessAnalytics);

// ==================== REVENUE ANALYTICS ====================
router.get('/revenue', protect, getRevenueAnalytics);

// ==================== USER BEHAVIOR ====================
router.get('/behavior', protect, getUserBehaviorAnalytics);

// ==================== EXPORT ANALYTICS ====================
router.get('/export', protect, exportAnalytics);

// ==================== LEGACY ROUTES ====================
// @desc    Log an analytics event (legacy)
// @route   POST /api/analytics/log
// @access  Public
router.post('/log', (req, res, next) => {
    // Optional auth: if token is present, attach user
    if (req.headers.authorization) {
        return protect(req, res, next);
    }
    next();
}, logEvent);

module.exports = router;
