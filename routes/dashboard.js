const express = require('express');
const router = express.Router();
const { getDashboardStats } = require('../controllers/dashboardController');
const { protect, attachOwnedBrands } = require('../middleware/authMiddleware');

// @route   GET /api/dashboard/stats
router.get('/stats', protect, attachOwnedBrands, getDashboardStats);

module.exports = router;
