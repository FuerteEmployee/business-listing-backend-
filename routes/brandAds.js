const express = require('express');
const router = express.Router();
const { 
    getBrandAds, createBrandAd, toggleBrandAdStatus, getBrandAdStats,
    getAdSlots
} = require('../controllers/adController');
const { protect } = require('../middleware/authMiddleware');
const { brandFeature } = require('../middleware/configMiddleware');

router.use(protect);
router.use(brandFeature('promotionsads', 'ads'));

router.get('/slots', getAdSlots);
router.get('/', getBrandAds);
router.post('/', createBrandAd);
router.get('/stats', getBrandAdStats);
router.patch('/:id/toggle', toggleBrandAdStatus);

module.exports = router;
