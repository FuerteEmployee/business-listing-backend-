const express = require('express');
const router = express.Router();
const {
    getSliders,
    getSlider,
    createSlider,
    updateSlider,
    deleteSlider
} = require('../controllers/sliderController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.get('/', getSliders);
router.get('/:id', getSlider);

// Protected routes
router.post('/', protect, authorize('Super Admin'), createSlider);
router.put('/:id', protect, authorize('Super Admin'), updateSlider);
router.delete('/:id', protect, authorize('Super Admin'), deleteSlider);

module.exports = router;
