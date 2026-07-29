const express = require('express');
const router = express.Router();
const { getPopularSearches } = require('../controllers/popularSearchesController');

// @route   GET /api/popular-searches
// @desc    Get popular searches based on city
// @access  Public
router.get('/', getPopularSearches);

module.exports = router;
