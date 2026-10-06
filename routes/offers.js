const express = require('express');
const router = express.Router();
const { 
    getBrandOffers, createOffer, updateOfferStatus, deleteOffers, trackOfferAction
} = require('../controllers/offerController');
const { protect } = require('../middleware/authMiddleware');
const { brandFeature } = require('../middleware/configMiddleware');

const offersEnabled = brandFeature('offersdeals');

router.get('/brand', protect, offersEnabled, getBrandOffers);
router.post('/', protect, offersEnabled, createOffer);
router.patch('/:id/status', protect, offersEnabled, updateOfferStatus);
router.delete('/', protect, offersEnabled, deleteOffers);
router.post('/:id/track', trackOfferAction); // Public for tracking

module.exports = router;
