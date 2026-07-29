const express = require('express');
const router = express.Router();
const { 
    getMerchantOffers, createOffer, updateOfferStatus, deleteOffers, trackOfferAction
} = require('../controllers/offerController');
const { protect } = require('../middleware/authMiddleware');

router.get('/merchant', protect, getMerchantOffers);
router.post('/', protect, createOffer);
router.patch('/:id/status', protect, updateOfferStatus);
router.delete('/', protect, deleteOffers);
router.post('/:id/track', trackOfferAction); // Public for tracking

module.exports = router;
