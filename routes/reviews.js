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
    flagReviewBrand,
    getBrandReviewStats,
    getBrandReviews,
    getMyReviewForBusiness,
    updateUserReview
} = require('../controllers/reviewController');
const { protect, admin } = require('../middleware/authMiddleware');

// Brand Owner & Public Routes
router.get('/latest', getLatestReviews);
router.get('/brand/stats', protect, getBrandReviewStats);
router.get('/brand/all', protect, getBrandReviews);
router.get('/my-review/:businessId', protect, getMyReviewForBusiness);
router.get('/:businessId', getBusinessReviews);
router.get('/user/:userId', protect, getUserReviews);
router.put('/:id', protect, updateUserReview);
router.put('/:id/reply', protect, replyToReview);
router.post('/:id/flag', protect, flagReviewBrand);
router.post('/', protect, addReview);
router.post('/:id/vote', protect, voteReview);
router.post('/:id/report', protect, reportReview);

// Admin Routes
router.get('/', protect, admin, getAllReviews);
router.put('/:id/status', protect, updateReviewStatus);
router.delete('/:id', protect, admin, deleteReview);

module.exports = router;
