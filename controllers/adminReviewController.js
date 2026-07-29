const Review = require('../models/Review');
const Company = require('../models/Company');
const mongoose = require('mongoose');

// Helper to recalculate and update company rating
const recalculateCompanyRating = async (businessId) => {
    try {
        const reviews = await Review.find({ businessId, status: 'Approved', isDeleted: false });
        const company = await Company.findById(businessId);
        
        if (company) {
            if (reviews.length > 0) {
                const reviewCount = reviews.length;
                const totalRating = reviews.reduce((acc, item) => item.rating + acc, 0);
                company.rating = parseFloat((totalRating / reviewCount).toFixed(1));
                company.reviewCount = reviewCount;
            } else {
                company.rating = 0;
                company.reviewCount = 0;
            }
            await company.save();
        }
    } catch (err) {
        console.error("Error recalculating rating:", err);
    }
};

// @desc    Get all reviews with advanced filtering (Admin)
// @route   GET /api/admin/reviews
exports.getAllReviewsAdmin = async (req, res) => {
    try {
        const { 
            search, 
            status, 
            rating, 
            businessId,
            dateStart, 
            dateEnd,
            page = 1,
            limit = 50 
        } = req.query;

        const query = { isDeleted: { $ne: true } };

        if (status) query.status = status;
        if (rating && rating !== "") query.rating = Number(rating);
        if (businessId) query.businessId = businessId;

        if (search) {
            query.$or = [
                { comment: { $regex: search, $options: 'i' } },
                { moderationNotes: { $regex: search, $options: 'i' } }
            ];
        }

        if (dateStart || dateEnd) {
            query.createdAt = {};
            if (dateStart) query.createdAt.$gte = new Date(dateStart);
            if (dateEnd) query.createdAt.$lte = new Date(dateEnd);
        }

        const skip = (page - 1) * limit;

        const reviews = await Review.find(query)
            .populate('userId', 'name email image')
            .populate('businessId', 'name slug logo image')
            .populate('moderatedBy', 'name email')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(Number(limit));

        const total = await Review.countDocuments(query);

        res.json({
            reviews,
            pagination: {
                total,
                page: Number(page),
                limit: Number(limit),
                pages: Math.ceil(total / limit)
            }
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

// @desc    Update single or bulk review status
// @route   POST /api/admin/reviews/bulk-action
exports.bulkReviewAction = async (req, res) => {
    try {
        const { ids, action, reason } = req.body;

        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ msg: 'No review IDs provided' });
        }

        const validActions = ['Approved', 'Rejected', 'Pending', 'Suspended', 'Delete'];
        if (!validActions.includes(action)) {
            return res.status(400).json({ msg: 'Invalid action' });
        }

        const businessIdsToUpdate = new Set();
        const reviews = await Review.find({ _id: { $in: ids } });
        reviews.forEach(r => businessIdsToUpdate.add(r.businessId.toString()));

        if (action === 'Delete') {
            await Review.updateMany(
                { _id: { $in: ids } },
                { 
                    $set: { 
                        isDeleted: true, 
                        deletedAt: new Date(),
                        moderatedBy: req.user.id
                    } 
                }
            );
        } else {
            await Review.updateMany(
                { _id: { $in: ids } },
                { 
                    $set: { 
                        status: action, 
                        moderationNotes: reason || '',
                        moderatedBy: req.user.id,
                        moderatedAt: new Date()
                    } 
                }
            );
        }

        // Recalculate ratings for all affected businesses
        for (const bId of businessIdsToUpdate) {
            await recalculateCompanyRating(bId);
        }

        res.json({ msg: `Successfully ${action === 'Delete' ? 'deleted' : 'updated'} ${ids.length} reviews` });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

// @desc    Add moderation note to a review
// @route   PUT /api/admin/reviews/:id/note
exports.addModerationNote = async (req, res) => {
    try {
        const { note } = req.body;
        const review = await Review.findById(req.params.id);

        if (!review) {
            return res.status(404).json({ msg: 'Review not found' });
        }

        review.moderationNotes = note;
        review.moderatedBy = req.user.id;
        review.moderatedAt = new Date();

        await review.save();
        res.json(review);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};
