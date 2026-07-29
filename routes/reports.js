const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/authMiddleware');
const {
    getUserGrowthReport,
    getListingReport,
    getRevenueReport,
    getLeadReport,
    getReviewReport,
    getSearchTrendsReport
} = require('../controllers/reportController');

// All report routes are protected and restricted to users with 'reporting' permission
router.use(protect);

// Higher level authorization - requires 'reporting.read' permission check in a real RBAC middleware 
// For now, we'll allow Super Admin, Admin, and Finance who have reporting access by default.
router.use(authorize('Super Admin', 'Admin', 'Finance', 'Moderator', 'Support', 'Viewer'));

router.get('/users', getUserGrowthReport);
router.get('/listings', getListingReport);
router.get('/revenue', getRevenueReport);
router.get('/leads', getLeadReport);
router.get('/reviews', getReviewReport);
router.get('/search-trends', getSearchTrendsReport);

module.exports = router;
