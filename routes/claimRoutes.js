const express = require('express');
const router = express.Router();
const { 
    createClaimRequest, 
    getAllClaimRequests, 
    updateClaimStatus,
    getMyClaimRequests 
} = require('../controllers/claimController');
const { protect, admin } = require('../middleware/authMiddleware');

// @route   POST /api/claims
// @desc    Submit a new claim request
// @access  Private
router.post('/', protect, createClaimRequest);

// @route   GET /api/claims/my-requests
// @desc    Get current user's claim requests
// @access  Private
router.get('/my-requests', protect, getMyClaimRequests);

// @route   GET /api/claims
// @desc    Get all claim requests (Admin only)
// @access  Private/Admin
router.get('/', protect, admin, getAllClaimRequests);

// @route   PUT /api/claims/:id
// @desc    Update claim status (Admin only)
// @access  Private/Admin
router.put('/:id', protect, admin, updateClaimStatus);

module.exports = router;
