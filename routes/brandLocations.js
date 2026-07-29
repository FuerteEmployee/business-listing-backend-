const BrandLocation = require('../models/BrandLocation');
const { protect, authorize, attachOwnedBrands } = require('../middleware/authMiddleware');
const express = require('express');
const router = express.Router();

// @desc    Get all brand locations
// @route   GET /api/brand-locations
router.get('/', protect, attachOwnedBrands, async (req, res) => {
    try {
        let query = {};
        const isOwner = req.user.role === 'Brand Owner' || req.user.role === 'Company Owner';
        const forceOwned = req.query.owned === 'true';

        if (forceOwned || isOwner) {
            query.brandId = { $in: req.ownedBrandIds || [] };
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
router.post('/', protect, authorize('Super Admin', 'Brand Owner', 'Company Owner'), attachOwnedBrands, async (req, res) => {
    try {
        const { brandId } = req.body;
        
        if (req.user.role === 'Brand Owner') {
            if (!req.ownedBrandIds.map(id => id.toString()).includes(brandId)) {
                return res.status(403).json({ msg: 'Not authorized for this brand' });
            }
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
router.put('/:id', protect, authorize('Super Admin', 'Brand Owner', 'Company Owner'), attachOwnedBrands, async (req, res) => {
    try {
        let location = await BrandLocation.findById(req.params.id);
        if (!location) return res.status(404).json({ msg: 'Location not found' });

        if (req.user.role === 'Brand Owner') {
            if (!req.ownedBrandIds.map(id => id.toString()).includes(location.brandId.toString())) {
                return res.status(403).json({ msg: 'Not authorized for this location' });
            }
        }

        location = await BrandLocation.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json(location);
    } catch (err) {
        res.status(500).json({ msg: 'Server Error', error: err.message });
    }
});

// @desc    Delete brand location
// @route   DELETE /api/brand-locations/:id
router.delete('/:id', protect, authorize('Super Admin', 'Brand Owner', 'Company Owner'), attachOwnedBrands, async (req, res) => {
    try {
        const location = await BrandLocation.findById(req.params.id);
        if (!location) return res.status(404).json({ msg: 'Location not found' });

        if (req.user.role === 'Brand Owner') {
            if (!req.ownedBrandIds.map(id => id.toString()).includes(location.brandId.toString())) {
                return res.status(403).json({ msg: 'Not authorized for this location' });
            }
        }

        await BrandLocation.findByIdAndDelete(req.params.id);
        res.json({ msg: 'Location removed' });
    } catch (err) {
        res.status(500).json({ msg: 'Server Error', error: err.message });
    }
});

module.exports = router;
