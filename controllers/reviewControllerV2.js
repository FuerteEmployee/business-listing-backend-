const Review = require('../models/Review');
const Company = require('../models/Company');
const AdminAuditLog = require('../models/AdminAuditLog');

// ==================== WRITE REVIEW ====================

// @desc    Create new review
// @route   POST /api/reviews
// @body    { businessId, rating, comment, images, aspectRatings }
exports.createReview = async (req, res) => {
    try {
        const { businessId, rating, comment, images, aspects } = req.body;

        // Validate
        if (!businessId || !rating || !comment) {
            return res.status(400).json({ success: false, msg: 'Required fields missing' });
        }

        if (comment.length < 20) {
            return res.status(400).json({ success: false, msg: 'Comment must be at least 20 characters' });
        }

        // Check if user already reviewed this business
        const existingReview = await Review.findOne({ 
            businessId, 
            userId: req.user._id,
            isDeleted: false 
        });

        if (existingReview) {
            return res.status(400).json({ success: false, msg: 'You already reviewed this business' });
        }

        // Check business exists
        const business = await Company.findById(businessId);
        if (!business) {
            return res.status(404).json({ success: false, msg: 'Business not found' });
        }

        // Create review (goes to Pending for moderation)
        const review = new Review({
            businessId,
            userId: req.user._id,
            rating,
            comment,
            images: images || [],
            aspects: aspects || { quality: 0, service: 0, value: 0 },
            status: 'Pending' // Requires admin moderation
        });

        await review.save();
        await review.populate('userId', 'name');
        await review.populate('businessId', 'name');

        res.status(201).json({
            success: true,
            msg: 'Review submitted successfully. Awaiting moderation approval.',
            review
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// ==================== BROWSE REVIEWS ====================

// @desc    Get business reviews
// @route   GET /api/reviews/business/:businessId
exports.getBusinessReviews = async (req, res) => {
    try {
        const { sort = 'recent', rating, page = 1, limit = 20 } = req.query;

        let query = {
            businessId: req.params.businessId,
            status: 'Approved',
            isDeleted: false
        };

        // Filter by rating
        if (rating) {
            query.rating = parseInt(rating);
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);

        // Sort options
        let sortObj = { createdAt: -1 }; // default: most recent
        if (sort === 'helpful') {
            sortObj = { 'helpfulVotes.count': -1, createdAt: -1 };
        } else if (sort === 'rating') {
            sortObj = { rating: -1 };
        }

        const reviews = await Review.find(query)
            .populate('userId', 'name profilePhoto')
            .sort(sortObj)
            .skip(skip)
            .limit(parseInt(limit));

        const total = await Review.countDocuments(query);

        // Get rating breakdown
        const allReviews = await Review.find({
            businessId: req.params.businessId,
            status: 'Approved',
            isDeleted: false
        });

        const breakdown = {
            5: allReviews.filter(r => r.rating === 5).length,
            4: allReviews.filter(r => r.rating === 4).length,
            3: allReviews.filter(r => r.rating === 3).length,
            2: allReviews.filter(r => r.rating === 2).length,
            1: allReviews.filter(r => r.rating === 1).length
        };

        res.json({
            success: true,
            reviews,
            breakdown,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// ==================== USER'S REVIEWS ====================

// @desc    Get user's reviews
// @route   GET /api/reviews/user/my-reviews
exports.getMyReviews = async (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const reviews = await Review.find({ userId: req.user._id, isDeleted: false })
            .populate('businessId', 'name')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const total = await Review.countDocuments({ userId: req.user._id, isDeleted: false });

        res.json({
            success: true,
            reviews,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// ==================== HELPFUL VOTES ====================

// @desc    Vote review as helpful/not helpful
// @route   PUT /api/reviews/:id/vote
// @body    { helpful: true/false }
exports.voteReview = async (req, res) => {
    try {
        const { helpful } = req.body;

        const review = await Review.findById(req.params.id);
        if (!review) {
            return res.status(404).json({ success: false, msg: 'Review not found' });
        }

        if (helpful === true) {
            // Check if already voted
            if (review.helpfulVotes.voters.includes(req.user._id)) {
                return res.status(400).json({ success: false, msg: 'You already voted helpful' });
            }

            // Remove from not helpful if exists
            review.notHelpfulVotes.voters = review.notHelpfulVotes.voters.filter(
                id => id.toString() !== req.user._id.toString()
            );
            if (review.notHelpfulVotes.voters.length < review.notHelpfulVotes.count) {
                review.notHelpfulVotes.count--;
            }

            // Add to helpful
            review.helpfulVotes.voters.push(req.user._id);
            review.helpfulVotes.count++;
        } else if (helpful === false) {
            // Check if already voted
            if (review.notHelpfulVotes.voters.includes(req.user._id)) {
                return res.status(400).json({ success: false, msg: 'You already voted not helpful' });
            }

            // Remove from helpful if exists
            review.helpfulVotes.voters = review.helpfulVotes.voters.filter(
                id => id.toString() !== req.user._id.toString()
            );
            if (review.helpfulVotes.voters.length < review.helpfulVotes.count) {
                review.helpfulVotes.count--;
            }

            // Add to not helpful
            review.notHelpfulVotes.voters.push(req.user._id);
            review.notHelpfulVotes.count++;
        }

        await review.save();

        res.json({
            success: true,
            msg: 'Vote recorded',
            review: {
                helpfulCount: review.helpfulVotes.count,
                notHelpfulCount: review.notHelpfulVotes.count
            }
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// ==================== FLAG REVIEW ====================

// @desc    Flag/report review
// @route   POST /api/reviews/:id/flag
// @body    { reason, description }
exports.flagReview = async (req, res) => {
    try {
        const { reason, description } = req.body;

        if (!reason) {
            return res.status(400).json({ success: false, msg: 'Reason is required' });
        }

        const review = await Review.findById(req.params.id);
        if (!review) {
            return res.status(404).json({ success: false, msg: 'Review not found' });
        }

        // Check if already flagged by user
        if (review.flags.some(f => f.flaggedBy.toString() === req.user._id.toString())) {
            return res.status(400).json({ success: false, msg: 'You already flagged this review' });
        }

        review.flags.push({
            reason,
            description,
            flaggedBy: req.user._id,
            flaggedAt: new Date()
        });

        await review.save();

        res.json({
            success: true,
            msg: 'Review reported successfully. Our team will review it.',
            review
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// ==================== EDIT/DELETE REVIEW ====================

// @desc    Edit own review (within 30 days)
// @route   PUT /api/reviews/:id
exports.updateReview = async (req, res) => {
    try {
        const { comment, rating, aspects } = req.body;

        const review = await Review.findById(req.params.id);
        if (!review) {
            return res.status(404).json({ success: false, msg: 'Review not found' });
        }

        // Check authorization
        if (review.userId.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, msg: 'Unauthorized' });
        }

        // Check 30-day edit window
        const daysSinceCreation = (Date.now() - review.createdAt) / (1000 * 60 * 60 * 24);
        if (daysSinceCreation > 30) {
            return res.status(400).json({ success: false, msg: 'Reviews can only be edited within 30 days' });
        }

        // Store edit history
        if (review.comment !== comment) {
            review.editHistory.push({
                oldComment: review.comment,
                editedAt: new Date()
            });
        }

        review.comment = comment || review.comment;
        review.rating = rating || review.rating;
        review.aspects = aspects || review.aspects;
        review.isEdited = true;
        review.editedAt = new Date();

        await review.save();

        res.json({ success: true, msg: 'Review updated successfully', review });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// @desc    Delete own review (soft delete)
// @route   DELETE /api/reviews/:id
exports.deleteReview = async (req, res) => {
    try {
        const review = await Review.findById(req.params.id);
        if (!review) {
            return res.status(404).json({ success: false, msg: 'Review not found' });
        }

        // Check authorization
        if (review.userId.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, msg: 'Unauthorized' });
        }

        review.isDeleted = true;
        review.deletedAt = new Date();
        await review.save();

        res.json({ success: true, msg: 'Review deleted' });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// ==================== OWNER REPLY ====================

// @desc    Business owner reply to review
// @route   POST /api/reviews/:id/owner-reply
exports.replyToReview = async (req, res) => {
    try {
        const { text } = req.body;

        if (!text || text.length > 500) {
            return res.status(400).json({ success: false, msg: 'Reply must be 1-500 characters' });
        }

        const review = await Review.findById(req.params.id)
            .populate('businessId', 'owner');

        if (!review) {
            return res.status(404).json({ success: false, msg: 'Review not found' });
        }

        // Check authorization (owner of the business)
        const business = await Company.findById(review.businessId._id);
        if (business.owner.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, msg: 'Unauthorized' });
        }

        review.ownerReply = {
            text,
            repliedBy: req.user._id,
            date: new Date()
        };

        await review.save();

        res.json({ success: true, msg: 'Reply posted successfully', review });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// All functions exported via exports.functionName pattern above
