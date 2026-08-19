const express = require('express');
const router = express.Router();
const { 
    addReview, 
    getBusinessReviews, 
    getAllReviews, 
    updateReviewStatus, 
    deleteReview, 
    getLatestReviews, 
    getUserReviews,
    voteReview,
    reportReview,
    replyToReview,
    flagReviewMerchant,
    getMerchantReviewStats,
    getMerchantReviews,
    getMyReviewForBusiness,
    updateUserReview
} = require('../controllers/reviewController');
const { protect, admin } = require('../middleware/authMiddleware');

// Merchant & Public Routes
router.get('/latest', getLatestReviews);
router.get('/merchant/stats', protect, getMerchantReviewStats);
router.get('/merchant/all', protect, getMerchantReviews);
router.get('/my-review/:businessId', protect, getMyReviewForBusiness);
router.get('/:businessId', getBusinessReviews);
router.get('/user/:userId', protect, getUserReviews);
router.put('/:id', protect, updateUserReview);
router.put('/:id/reply', protect, replyToReview);
router.post('/:id/flag', protect, flagReviewMerchant);
router.post('/', protect, addReview);
router.post('/:id/vote', protect, voteReview);
router.post('/:id/report', protect, reportReview);

// Admin Routes
router.get('/', protect, admin, getAllReviews);
router.put('/:id/status', protect, updateReviewStatus);
router.delete('/:id', protect, admin, deleteReview);

module.exports = router;
