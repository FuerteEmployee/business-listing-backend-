const BrandLocation = require('../models/BrandLocation');
const {
    protect,
    authorize,
    attachOwnedBrands,
    isBrandScoped,
    ownsBrand,
    BRAND_SCOPED_ROLES
} = require('../middleware/authMiddleware');
const express = require('express');
const router = express.Router();

// @desc    Get all brand locations
// @route   GET /api/brand-locations
router.get('/', protect, attachOwnedBrands, async (req, res) => {
    try {
        let query = {};

        if (isBrandScoped(req.user) || req.query.owned === 'true') {
            // Honour a requested brand only when it is one of theirs.
            query.brandId = ownsBrand(req, req.query.brandId)
                ? req.query.brandId
                : { $in: req.ownedBrandIds || [] };
        } else if (req.query.brandId) {
            query.brandId = req.query.brandId;
        }

        const locations = await BrandLocation.find(query)
            .populate('brandId', 'name')
            .populate('country_id', 'name')
            .populate('state_id', 'name')
            .populate('city_id', 'name')
            .populate('area_id', 'name');
            
        res.json(locations);
    } catch (err) {
        res.status(500).json({ msg: 'Server Error', error: err.message });
    }
});

// @desc    Create brand location
// @route   POST /api/brand-locations
router.post('/', protect, authorize('Super Admin', ...BRAND_SCOPED_ROLES), attachOwnedBrands, async (req, res) => {
    try {
        const { brandId } = req.body;

        if (isBrandScoped(req.user) && !ownsBrand(req, brandId)) {
            return res.status(403).json({ msg: 'Not authorized for this brand' });
        }

        const location = new BrandLocation(req.body);
        await location.save();
        res.status(201).json(location);
    } catch (err) {
        res.status(500).json({ msg: 'Server Error', error: err.message });
    }
});

// @desc    Update brand location
// @route   PUT /api/brand-locations/:id
router.put('/:id', protect, authorize('Super Admin', ...BRAND_SCOPED_ROLES), attachOwnedBrands, async (req, res) => {
    try {
        let location = await BrandLocation.findById(req.params.id);
        if (!location) return res.status(404).json({ msg: 'Location not found' });

        if (isBrandScoped(req.user) && !ownsBrand(req, location.brandId)) {
            return res.status(403).json({ msg: 'Not authorized for this location' });
        }

        location = await BrandLocation.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json(location);
    } catch (err) {
        res.status(500).json({ msg: 'Server Error', error: err.message });
    }
});

// @desc    Delete brand location
// @route   DELETE /api/brand-locations/:id
router.delete('/:id', protect, authorize('Super Admin', ...BRAND_SCOPED_ROLES), attachOwnedBrands, async (req, res) => {
    try {
        const location = await BrandLocation.findById(req.params.id);
        if (!location) return res.status(404).json({ msg: 'Location not found' });

        if (isBrandScoped(req.user) && !ownsBrand(req, location.brandId)) {
            return res.status(403).json({ msg: 'Not authorized for this location' });
        }

        await BrandLocation.findByIdAndDelete(req.params.id);
        res.json({ msg: 'Location removed' });
    } catch (err) {
        res.status(500).json({ msg: 'Server Error', error: err.message });
    }
});

module.exports = router;
