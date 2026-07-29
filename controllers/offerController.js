const Offer = require('../models/Offer');
const Company = require('../models/Company');

// @desc    Get all offers for a merchant
// @route   GET /api/offers/merchant
exports.getMerchantOffers = async (req, res) => {
    try {
        const ownCompanies = await Company.find({ owner: req.user._id }).select('_id');
        const companyIds = ownCompanies.map(c => c._id);

        const offers = await Offer.find({ businessId: { $in: companyIds } })
            .populate('businessId', 'name image')
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            count: offers.length,
            offers
        });
    } catch (error) {
        res.status(500).json({ success: false, msg: error.message });
    }
};

// @desc    Create a new offer
// @route   POST /api/offers
exports.createOffer = async (req, res) => {
    try {
        const { businessId, title, description, discountType, discountValue, validity, terms } = req.body;

        // Verify ownership
        const company = await Company.findOne({ _id: businessId, owner: req.user._id });
        if (!company) {
            return res.status(403).json({ success: false, msg: 'Not authorized' });
        }

        const offer = await Offer.create({
            businessId,
            title,
            description,
            discountType,
            discountValue,
            validity,
            terms,
            createdBy: req.user._id
        });

        res.status(201).json({ success: true, offer });
    } catch (error) {
        res.status(400).json({ success: false, msg: error.message });
    }
};

// @desc    Update offer status
// @route   PATCH /api/offers/:id/status
exports.updateOfferStatus = async (req, res) => {
    try {
        const offer = await Offer.findById(req.params.id);
        if (!offer) return res.status(404).json({ success: false, msg: 'Offer not found' });

        // Verify ownership
        const company = await Company.findOne({ _id: offer.businessId, owner: req.user._id });
        if (!company) {
            return res.status(403).json({ success: false, msg: 'Not authorized' });
        }

        offer.status = req.body.status;
        await offer.save();

        res.status(200).json({ success: true, offer });
    } catch (error) {
        res.status(400).json({ success: false, msg: error.message });
    }
};

// @desc    Delete offer (Bulk supported if IDs passed as comma-separated or in body)
// @route   DELETE /api/offers
exports.deleteOffers = async (req, res) => {
    try {
        const { ids } = req.body; // Array of IDs
        
        // Safety check: ensure all offers belong to merchant companies
        const ownCompanies = await Company.find({ owner: req.user._id }).select('_id');
        const companyIds = ownCompanies.map(c => c._id);

        const result = await Offer.deleteMany({
            _id: { $in: ids },
            businessId: { $in: companyIds }
        });

        res.status(200).json({
            success: true,
            msg: `Successfully deleted ${result.deletedCount} offers`
        });
    } catch (error) {
        res.status(500).json({ success: false, msg: error.message });
    }
};

// @desc    Track click/view for analytics
// @route   POST /api/offers/:id/track
exports.trackOfferAction = async (req, res) => {
    try {
        const { type } = req.body; // 'view' or 'redemption'
        const field = type === 'redemption' ? 'redemptions' : 'views';
        
        await Offer.findByIdAndUpdate(req.params.id, {
            $inc: { [`performance.${field}`]: 1 }
        });

        res.status(200).json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, msg: error.message });
    }
};
