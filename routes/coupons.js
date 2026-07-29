const express = require('express');
const router = express.Router();
const { getCoupons, createCoupon, updateCoupon, validateCoupon, toggleCoupon } = require('../controllers/couponController');
const { protect, admin } = require('../middleware/authMiddleware');

router.get('/', protect, admin, getCoupons);
router.post('/', protect, admin, createCoupon);
router.put('/:id', protect, admin, updateCoupon);
router.post('/validate', validateCoupon);
router.patch('/:id/toggle', protect, admin, toggleCoupon);

module.exports = router;
