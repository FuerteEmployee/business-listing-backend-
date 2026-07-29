const express = require('express');
const router = express.Router();
const { 
    getMerchantAds, createMerchantAd, toggleMerchantAdStatus, getMerchantAdStats,
    getAdSlots
} = require('../controllers/adController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

router.get('/slots', getAdSlots);
router.get('/', getMerchantAds);
router.post('/', createMerchantAd);
router.get('/stats', getMerchantAdStats);
router.patch('/:id/toggle', toggleMerchantAdStatus);

module.exports = router;
