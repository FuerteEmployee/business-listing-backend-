const express = require('express');
const router = express.Router();
const { 
    getAdSlots, createAdSlot, updateAdSlot, deleteAdSlot,
    getAds, createAd, updateAd, deleteAd,
    moderateAd, toggleAdStatus, getAdPerformance
} = require('../controllers/adController');
const { protect, admin } = require('../middleware/authMiddleware');

// All routes are protected and admin-only for now
router.use(protect);
router.use(admin);

// Slots
router.route('/slots')
    .get(getAdSlots)
    .post(createAdSlot);

router.route('/slots/:id')
    .patch(updateAdSlot)
    .delete(deleteAdSlot);

// Ads
router.route('/')
    .get(getAds)
    .post(createAd);

router.get('/analytics', getAdPerformance);

router.route('/:id')
    .patch(updateAd)
    .delete(deleteAd);

router.post('/:id/moderate', moderateAd);
router.patch('/:id/toggle', toggleAdStatus);

module.exports = router;
