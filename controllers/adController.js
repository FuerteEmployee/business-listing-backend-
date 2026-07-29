const AdSlot = require('../models/AdSlot');
const Advertisement = require('../models/Advertisement');
const Company = require('../models/Company');
const { AdminAuditLog } = require('../models/AdminAuditLog');

// @desc    Get all ad slots
// @route   GET /api/ads/slots
// @access  Private/Admin
exports.getAdSlots = async (req, res) => {
    try {
        const slots = await AdSlot.find().sort({ createdAt: -1 });
        res.status(200).json({
            success: true,
            count: slots.length,
            slots
        });
    } catch (error) {
        res.status(500).json({ success: false, msg: error.message });
    }
};

// @desc    Create ad slot
// @route   POST /api/ads/slots
exports.createAdSlot = async (req, res) => {
    try {
        const slot = await AdSlot.create(req.body);
        res.status(201).json({ success: true, slot });
    } catch (error) {
        res.status(400).json({ success: false, msg: error.message });
    }
};

// @desc    Update ad slot
// @route   PATCH /api/ads/slots/:id
exports.updateAdSlot = async (req, res) => {
    try {
        const slot = await AdSlot.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!slot) return res.status(404).json({ success: false, msg: 'Slot not found' });
        res.status(200).json({ success: true, slot });
    } catch (error) {
        res.status(400).json({ success: false, msg: error.message });
    }
};

// @desc    Delete ad slot
// @route   DELETE /api/ads/slots/:id
exports.deleteAdSlot = async (req, res) => {
    try {
        const slot = await AdSlot.findByIdAndDelete(req.params.id);
        if (!slot) return res.status(404).json({ success: false, msg: 'Slot not found' });
        res.status(200).json({ success: true, msg: 'Slot deleted' });
    } catch (error) {
        res.status(400).json({ success: false, msg: error.message });
    }
};

// @desc    Get all advertisements (with filters)
// @route   GET /api/ads
exports.getAds = async (req, res) => {
    try {
        const { status, slot, business, search, page = 1, limit = 20 } = req.query;
        const query = {};

        if (status && status !== 'all') query.status = status;
        if (slot) query.slotId = slot;
        if (business) query.businessId = business;
        if (search) query.title = { $regex: search, $options: 'i' };

        const skip = (page - 1) * limit;
        const total = await Advertisement.countDocuments(query);
        const ads = await Advertisement.find(query)
            .populate('businessId', 'name email')
            .populate('slotId', 'name page position')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        res.status(200).json({
            success: true,
            total,
            pages: Math.ceil(total / limit),
            ads
        });
    } catch (error) {
        res.status(500).json({ success: false, msg: error.message });
    }
};

// @desc    Create advertisement
// @route   POST /api/ads
exports.createAd = async (req, res) => {
    try {
        const ad = await Advertisement.create({
            ...req.body,
            createdBy: req.user._id
        });
        res.status(201).json({ success: true, ad });
    } catch (error) {
        res.status(400).json({ success: false, msg: error.message });
    }
};

// @desc    Update advertisement
// @route   PATCH /api/ads/:id
exports.updateAd = async (req, res) => {
    try {
        const ad = await Advertisement.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!ad) return res.status(404).json({ success: false, msg: 'Ad not found' });
        res.status(200).json({ success: true, ad });
    } catch (error) {
        res.status(400).json({ success: false, msg: error.message });
    }
};

// @desc    Delete advertisement
// @route   DELETE /api/ads/:id
exports.deleteAd = async (req, res) => {
    try {
        const ad = await Advertisement.findByIdAndDelete(req.params.id);
        if (!ad) return res.status(404).json({ success: false, msg: 'Ad not found' });
        res.status(200).json({ success: true, msg: 'Ad deleted' });
    } catch (error) {
        res.status(400).json({ success: false, msg: error.message });
    }
};

// @desc    Moderate advertisement (Approve/Reject)
// @route   POST /api/ads/:id/moderate
exports.moderateAd = async (req, res) => {
    try {
        const { status, moderationNote } = req.body;
        if (!['approved', 'rejected'].includes(status)) {
            return res.status(400).json({ success: false, msg: 'Invalid status for moderation' });
        }

        const ad = await Advertisement.findById(req.params.id);
        if (!ad) return res.status(404).json({ success: false, msg: 'Ad not found' });

        ad.status = status;
        ad.moderationNote = moderationNote;
        ad.approvedBy = req.user._id;

        // If approved, and current date is within schedule, set to active
        if (status === 'approved') {
            const now = new Date();
            if (now >= ad.schedule.startDate && now <= ad.schedule.endDate) {
                ad.status = 'active';
            }
        }

        await ad.save();

        // Log audit
        await AdminAuditLog.create({
            adminId: req.user._id,
            action: 'AD_MODERATION',
            details: `Ad ${ad.title} ${status}`,
            targetId: ad._id,
            targetModel: 'Advertisement'
        });

        res.status(200).json({ success: true, ad });
    } catch (error) {
        res.status(400).json({ success: false, msg: error.message });
    }
};

// @desc    Toggle Ad Status (Pause/Resume)
// @route   PATCH /api/ads/:id/toggle
exports.toggleAdStatus = async (req, res) => {
    try {
        const ad = await Advertisement.findById(req.params.id);
        if (!ad) return res.status(404).json({ success: false, msg: 'Ad not found' });

        if (ad.status === 'active') {
            ad.status = 'paused';
        } else if (ad.status === 'paused') {
            ad.status = 'active';
        } else {
            return res.status(400).json({ success: false, msg: `Cannot toggle status from ${ad.status}` });
        }

        await ad.save();
        res.status(200).json({ success: true, ad });
    } catch (error) {
        res.status(400).json({ success: false, msg: error.message });
    }
};

// @desc    Get ad performance analytics
// @route   GET /api/ads/analytics
exports.getAdPerformance = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        let dateFilter = {};
        if (startDate && endDate) {
            dateFilter = { createdAt: { $gte: new Date(startDate), $lte: new Date(endDate) } };
        }

        // Summary stats
        const stats = await Advertisement.aggregate([
            {
                $group: {
                    _id: null,
                    totalImpressions: { $sum: "$performance.impressions" },
                    totalClicks: { $sum: "$performance.clicks" },
                    totalSpend: { $sum: "$performance.spent" },
                    activeAds: { $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] } }
                }
            }
        ]);

        // Top performing ads
        const topAds = await Advertisement.find()
            .populate('businessId', 'name')
            .sort({ "performance.clicks": -1 })
            .limit(5);

        res.status(200).json({
            success: true,
            summary: stats[0] || { totalImpressions: 0, totalClicks: 0, totalSpend: 0, activeAds: 0 },
            topAds
        });
    } catch (error) {
        res.status(500).json({ success: false, msg: error.message });
    }
};

// --- Merchant Specific Controllers ---

// @desc    Get merchant's advertisements
// @route   GET /api/merchant-ads
// @access  Private
exports.getMerchantAds = async (req, res) => {
    try {
        // Find companies owned by this user
        const ownCompanies = await Company.find({ owner: req.user._id }).select('_id');
        const companyIds = ownCompanies.map(c => c._id);

        const ads = await Advertisement.find({ businessId: { $in: companyIds } })
            .populate('businessId', 'name image')
            .populate('slotId', 'name position')
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            count: ads.length,
            ads
        });
    } catch (error) {
        res.status(500).json({ success: false, msg: error.message });
    }
};

// @desc    Create merchant advertisement (Boost)
// @route   POST /api/merchant-ads
// @access  Private
exports.createMerchantAd = async (req, res) => {
    try {
        const { businessId, slotId, title, budget, schedule, pricingModel, targetLocations, targetCategories } = req.body;

        // Verify ownership
        const company = await Company.findOne({ _id: businessId, owner: req.user._id });
        if (!company) {
            return res.status(403).json({ success: false, msg: 'Not authorized to promote this business' });
        }

        const ad = await Advertisement.create({
            businessId,
            slotId,
            title,
            budget,
            schedule,
            pricingModel: pricingModel || 'flat',
            targetLocations,
            targetCategories,
            status: 'pending_review',
            createdBy: req.user._id
        });

        res.status(201).json({ success: true, ad });
    } catch (error) {
        res.status(400).json({ success: false, msg: error.message });
    }
};

// @desc    Merchant Toggle Ad Status (Pause/Resume)
// @route   PATCH /api/merchant-ads/:id/toggle
exports.toggleMerchantAdStatus = async (req, res) => {
    try {
        const ad = await Advertisement.findById(req.params.id);
        if (!ad) return res.status(404).json({ success: false, msg: 'Ad not found' });

        // Verify ownership
        const company = await Company.findOne({ _id: ad.businessId, owner: req.user._id });
        if (!company) {
            return res.status(403).json({ success: false, msg: 'Not authorized' });
        }

        if (ad.status === 'active') {
            ad.status = 'paused';
        } else if (ad.status === 'paused') {
            ad.status = 'active';
        } else {
            return res.status(400).json({ success: false, msg: `Cannot toggle from ${ad.status}. Needs admin approval?` });
        }

        await ad.save();
        res.status(200).json({ success: true, ad });
    } catch (error) {
        res.status(400).json({ success: false, msg: error.message });
    }
};

// @desc    Get merchant ad analytics
// @route   GET /api/merchant-ads/stats
exports.getMerchantAdStats = async (req, res) => {
    try {
        const ownCompanies = await Company.find({ owner: req.user._id }).select('_id');
        const companyIds = ownCompanies.map(c => c._id);

        const stats = await Advertisement.aggregate([
            { $match: { businessId: { $in: companyIds } } },
            {
                $group: {
                    _id: null,
                    totalImpressions: { $sum: "$performance.impressions" },
                    totalClicks: { $sum: "$performance.clicks" },
                    totalSpend: { $sum: "$performance.spent" },
                    activeCampaigns: { $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] } }
                }
            }
        ]);

        res.status(200).json({
            success: true,
            summary: stats[0] || { totalImpressions: 0, totalClicks: 0, totalSpend: 0, activeCampaigns: 0 }
        });
    } catch (error) {
        res.status(500).json({ success: false, msg: error.message });
    }
};
