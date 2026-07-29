const express = require('express');
const router = express.Router();
const osmController = require('../controllers/osmController');
const { protect, checkPermission } = require('../middleware/authMiddleware');

// Public search (optional, or protect with admin)
router.get('/search', protect, checkPermission('listingManagement', 'read'), osmController.searchOSM);
router.get('/categories', protect, checkPermission('listingManagement', 'read'), osmController.getCategories);

module.exports = router;
