const express = require('express');
const router = express.Router();
const { getDashboardStats } = require('../controllers/dashboardController');
const { protect, attachOwnedBrands, requireAdminOrBrand } = require('../middleware/authMiddleware');

// @route   GET /api/dashboard/stats
// Admin dashboard, or a brand owner's own figures. A normal user used to fall through to the
// platform-wide (admin) numbers because the controller only special-cases brand owners.
router.get('/stats', protect, requireAdminOrBrand, attachOwnedBrands, getDashboardStats);

module.exports = router;
