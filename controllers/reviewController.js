const Company = require('../models/Company');
const User = require('../models/User');
const Review = require('../models/Review');
const { sendNotification } = require('../services/notificationService');

// Helper to recalculate and update company rating
const recalculateCompanyRating = async (businessId) => {
    const reviews = await Review.find({ businessId, status: 'Approved', isDeleted: { $ne: true } });
    const company = await Company.findById(businessId);
    
    if (company) {
        // Initialize distribution
        const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        
        if (reviews.length > 0) {
            const reviewCount = reviews.length;
            const sumRating = reviews.reduce((acc, item) => {
                // Update distribution
                const r = Math.round(item.rating);
                if (distribution[r] !== undefined) distribution[r]++;
                return item.rating + acc;
            }, 0);
            
            company.rating = parseFloat((sumRating / reviewCount).toFixed(1));
            company.reviewCount = reviewCount;
            company.ratingDistribution = distribution;
        } else {
            company.rating = 0;
            company.reviewCount = 0;
            company.ratingDistribution = distribution;
        }
        await company.save();
    }
};

// @desc    Add a review
// @route   POST /api/reviews
// @access  Private
exports.addReview = async (req, res) => {
    try {
        const { businessId, rating, comment, images } = req.body;

        // Check if company exists
        const company = await Company.findById(businessId);
        if (!company) {
            return res.status(404).json({ msg: 'Company not found' });
        }

        // Check for existing review (Single Review Policy)
        const existingReview = await Review.findOne({ businessId, userId: req.user.id, isDeleted: { $ne: true } });
        if (existingReview) {
            return res.status(400).json({ msg: 'You have already reviewed this business. Please edit your existing review.' });
        }

        const review = new Review({
            businessId,
            userId: req.user.id,
            rating,
            comment,
            images,
            aspects: req.body.aspects || { quality: 0, service: 0, value: 0 }
        });

        // Fraud & Spam Detection
        const FraudAlert = require('../models/FraudAlert');
        const { realTimeFraudCheck } = require('./fraudController');
        
        const metadata = {
            ipAddress: req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress,
            userAgent: req.headers['user-agent']
        };

        const fraudResult = await realTimeFraudCheck('review', { businessId, comment }, req.user.id, metadata);

        if (fraudResult.isSuspicious) {
            review.status = 'Pending'; // Force moderation
            if (fraudResult.severity === 'high') {
                review.status = 'Suspended'; // Hide immediately if high risk
            }
        }

        // Attach metadata to review for historical tracking
        review.metadata = {
            ...review.metadata,
            ipAddress: metadata.ipAddress,
            userAgent: metadata.userAgent
        };

        await review.save();

        // Log to AdminAuditLog
        try {
            const AdminAuditLog = require('../models/AdminAuditLog');
            await AdminAuditLog.create({
                adminId: req.user.id,
                action: 'REVIEW_CREATED',
                targetType: 'Review',
                targetId: review._id,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent'],
                notes: `${req.user.name} submitted review on listing '${company.name}'`
            });
        } catch (auditErr) {
            console.error('Failed to log review creation audit:', auditErr.message);
        }

        if (fraudResult.isSuspicious) {
            // Create the fraud alert linked to the new review
            await FraudAlert.create({
                ...fraudResult.alertData,
                targetId: review._id,
                targetModel: 'Review',
                status: 'pending'
            });
        }

        // Update company rating average
        if (review.status === 'Approved') {
            await recalculateCompanyRating(businessId);
        }

        // Notify Business Owner about new review
        if (company.owner) {
            await sendNotification({
                recipient: company.owner,
                sender: req.user.id,
                type: 'Review',
                title: 'New Review Received',
                message: `Someone just left a ${rating}-star review for ${company.name}`,
                link: `/merchant/reviews`,
                metadata: { reviewId: review._id, businessId: company._id }
            });
        }

        // Update user review stats
        await User.findByIdAndUpdate(req.user.id, { $inc: { reviewCount: 1 } });

        res.status(201).json(review);
    } catch (err) {
        console.error('Review Error:', err.message);
        if (err.name === 'ValidationError') {
            const messages = Object.values(err.errors).map(val => val.message);
            return res.status(400).json({ msg: messages.join(', ') });
        }
        res.status(500).json({ msg: 'Server Error' });
    }
};

// @desc    Get reviews for a business
// @route   GET /api/reviews/:businessId
// @access  Public
exports.getBusinessReviews = async (req, res) => {
    try {
        const { sort = 'recent', filter = 'all' } = req.query;
        let query = { 
            businessId: req.params.businessId,
            status: 'Approved',
            isDeleted: { $ne: true }
        };

        if (filter === 'photos') {
            query.images = { $exists: true, $ne: [] };
        } else if (filter === 'quality') {
            query['aspects.quality'] = { $gte: 4 };
        } else if (filter === 'service') {
            query['aspects.service'] = { $gte: 4 };
        } else if (filter === 'value') {
            query['aspects.value'] = { $gte: 4 };
        }

        let sortQuery = { createdAt: -1 };
        if (sort === 'helpful') {
            sortQuery = { 'helpfulVotes.count': -1, createdAt: -1 };
        } else if (sort === 'ratingHigh') {
            sortQuery = { rating: -1, createdAt: -1 };
        } else if (sort === 'ratingLow') {
            sortQuery = { rating: 1, createdAt: -1 };
        }

        const reviews = await Review.find(query)
            .populate('userId', 'name')
            .sort(sortQuery);

        const [totalCount, photosCount, qualityCount, serviceCount, valueCount] = await Promise.all([
            Review.countDocuments({ businessId: req.params.businessId, status: 'Approved', isDeleted: { $ne: true } }),
            Review.countDocuments({ businessId: req.params.businessId, status: 'Approved', isDeleted: { $ne: true }, images: { $exists: true, $ne: [] } }),
            Review.countDocuments({ businessId: req.params.businessId, status: 'Approved', isDeleted: { $ne: true }, 'aspects.quality': { $gte: 4 } }),
            Review.countDocuments({ businessId: req.params.businessId, status: 'Approved', isDeleted: { $ne: true }, 'aspects.service': { $gte: 4 } }),
            Review.countDocuments({ businessId: req.params.businessId, status: 'Approved', isDeleted: { $ne: true }, 'aspects.value': { $gte: 4 } })
        ]);

        res.json({
            reviews,
            counts: {
                all: totalCount,
                photos: photosCount,
                quality: qualityCount,
                service: serviceCount,
                value: valueCount
            }
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
};

// @desc    Vote on a review (Helpful / Not Helpful)
// @route   POST /api/reviews/:id/vote
// @access  Private
exports.voteReview = async (req, res) => {
    try {
        const { type } = req.body; // 'helpful' or 'notHelpful'
        if (!['helpful', 'notHelpful'].includes(type)) {
            return res.status(400).json({ msg: 'Invalid vote type' });
        }

        const review = await Review.findById(req.params.id);
        if (!review) {
            return res.status(404).json({ msg: 'Review not found' });
        }

        const userId = req.user.id;
        const helpfulVoters = review.helpfulVotes.voters.map(id => id.toString());
        const notHelpfulVoters = review.notHelpfulVotes.voters.map(id => id.toString());

        // Remove from other side if exists
        if (type === 'helpful') {
            if (helpfulVoters.includes(userId)) {
                // Remove vote if clicking again
                review.helpfulVotes.voters.pull(userId);
                review.helpfulVotes.count = Math.max(0, review.helpfulVotes.count - 1);
            } else {
                review.helpfulVotes.voters.push(userId);
                review.helpfulVotes.count += 1;
                // Pull from notHelpful if existed
                if (notHelpfulVoters.includes(userId)) {
                    review.notHelpfulVotes.voters.pull(userId);
                    review.notHelpfulVotes.count = Math.max(0, review.notHelpfulVotes.count - 1);
                }
            }
        } else {
            if (notHelpfulVoters.includes(userId)) {
                review.notHelpfulVotes.voters.pull(userId);
                review.notHelpfulVotes.count = Math.max(0, review.notHelpfulVotes.count - 1);
            } else {
                review.notHelpfulVotes.voters.push(userId);
                review.notHelpfulVotes.count += 1;
                if (helpfulVoters.includes(userId)) {
                    review.helpfulVotes.voters.pull(userId);
                    review.helpfulVotes.count = Math.max(0, review.helpfulVotes.count - 1);
                }
            }
        }

        await review.save();
        res.json(review);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
};

// @desc    Report/Flag a review
// @route   POST /api/reviews/:id/report
// @access  Private
exports.reportReview = async (req, res) => {
    try {
        const { reason, description } = req.body;
        const review = await Review.findById(req.params.id);

        if (!review) {
            return res.status(404).json({ msg: 'Review not found' });
        }

        // Check if user already reported
        const alreadyReported = review.flags.some(f => f.flaggedBy.toString() === req.user.id);
        if (alreadyReported) {
            return res.status(400).json({ msg: 'You have already reported this review' });
        }

        review.flags.push({
            flaggedBy: req.user.id,
            reason,
            description,
            flaggedAt: new Date()
        });

        // Optional: Auto-suspend if many flags
        if (review.flags.length >= 5 && review.status !== 'Suspended') {
            review.status = 'Pending'; // Move back to moderation
        }

        await review.save();
        res.json({ msg: 'Review reported successfully' });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
};

// @desc    Get all reviews (Admin)
// @route   GET /api/reviews
// @access  Private/Admin
exports.getAllReviews = async (req, res) => {
    try {
        const reviews = await Review.find()
            .populate('userId', 'name email')
            .populate('businessId', 'name')
            .sort({ createdAt: -1 });

        res.json(reviews);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
};

// @desc    Update review status (Admin/Owner)
// @route   PUT /api/reviews/:id/status
// @access  Private
exports.updateReviewStatus = async (req, res) => {
    try {
        const { status } = req.body;
        const review = await Review.findById(req.params.id);

        if (!review) {
            return res.status(404).json({ msg: 'Review not found' });
        }

        // Authorization check: Admin/SuperAdmin or Company Owner
        let isAuthorized = false;
        if (req.user.role === 'Super Admin' || req.user.role === 'Admin') {
            isAuthorized = true;
        } else {
            const company = await Company.findById(review.businessId);
            if (company && company.owner && company.owner.toString() === req.user.id.toString()) {
                isAuthorized = true;
            }
            if (company && req.user.companyId && req.user.companyId.toString() === review.businessId.toString()) {
                isAuthorized = true;
            }
        }

        if (!isAuthorized) {
            return res.status(403).json({ msg: 'Not authorized to change this review status' });
        }

        const oldStatus = review.status;
        review.status = status;

        if (req.body.merchantReply) {
            review.ownerReply = {
                text: req.body.merchantReply,
                date: new Date()
            };
        }

        await review.save();

        // Recalculate company rating if status changed to/from 'Approved'
        if (oldStatus === 'Approved' || status === 'Approved') {
            await recalculateCompanyRating(review.businessId);
        }

        // Notify User about status update or reply
        if (review.userId) {
            let title = 'Review Status Updated';
            let message = `Your review for ${review.businessId.name || 'a business'} has been ${status.toLowerCase()}.`;
            
            if (req.body.merchantReply) {
                title = 'New Merchant Reply';
                message = `The owner of ${review.businessId.name || 'the business'} has responded to your review.`;
            }

            await sendNotification({
                recipientId: review.userId,
                senderId: req.user.id,
                type: 'SYSTEM',
                title,
                message,
                link: `/profile/reviews`,
                metadata: { reviewId: review._id }
            });
        }

        res.json(review);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
};

// @desc    Delete review (Admin)
// @route   DELETE /api/reviews/:id
// @access  Private/Admin
exports.deleteReview = async (req, res) => {
    try {
        const review = await Review.findById(req.params.id);

        if (!review) {
            return res.status(404).json({ msg: 'Review not found' });
        }

        const businessId = review.businessId;
        const wasApproved = review.status === 'Approved';
        
        await Review.deleteOne({ _id: req.params.id });

        // Recalculate company rating if deleted review was approved
        if (wasApproved) {
            await recalculateCompanyRating(businessId);
        }

        // Update user review stats
        if (review.userId) {
            await User.findByIdAndUpdate(review.userId, { $inc: { reviewCount: -1 } });
        }

        res.json({ msg: 'Review removed' });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
};

// @desc    Get latest reviews
// @route   GET /api/reviews/latest
// @access  Public
exports.getLatestReviews = async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        const reviews = await Review.find({ status: 'Approved' })
            .populate('userId', 'name')
            .populate('businessId', 'name slug image rating')
            .sort({ createdAt: -1 })
            .limit(limit);

        res.json(reviews);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
};

// @desc    Get reviews for a user
// @route   GET /api/reviews/user/:userId
// @access  Private
exports.getUserReviews = async (req, res) => {
    try {
        const reviews = await Review.find({ userId: req.params.userId })
            .populate('businessId', 'name slug image rating')
            .sort({ createdAt: -1 });

        res.json(reviews);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
};

// @desc    Merchant Reply to a review
// @route   PUT /api/reviews/:id/reply
// @access  Private (Merchant)
exports.replyToReview = async (req, res) => {
    try {
        const { text } = req.body;
        if (!text) return res.status(400).json({ msg: 'Reply text is required' });

        const review = await Review.findById(req.params.id).populate('businessId');
        if (!review) return res.status(404).json({ msg: 'Review not found' });

        // Verify Ownership
        if (review.businessId.owner.toString() !== req.user.id) {
            return res.status(403).json({ msg: 'Not authorized to reply to this review' });
        }

        review.ownerReply = {
            text,
            repliedBy: req.user.id,
            date: new Date()
        };

        await review.save();

        // Log to AdminAuditLog
        try {
            const AdminAuditLog = require('../models/AdminAuditLog');
            await AdminAuditLog.create({
                adminId: req.user.id,
                action: 'REVIEW_REPLIED',
                targetType: 'Review',
                targetId: review._id,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent'],
                notes: `Merchant ${req.user.name} replied to review on '${review.businessId.name}'`
            });
        } catch (auditErr) {
            console.error('Failed to log review reply audit:', auditErr.message);
        }

        // Populate userId for consistent frontend rendering
        await review.populate('userId', 'name email image');

        // Notify Reviewer
        await sendNotification({
            recipientId: review.userId,
            senderId: req.user.id,
            type: 'SYSTEM',
            title: 'New Reply to Your Review',
            message: `The owner of ${review.businessId.name} has responded to your feedback.`,
            link: `/profile/reviews`,
            metadata: { reviewId: review._id }
        });

        res.json(review);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
};

// @desc    Merchant Flag/Escalate a review
// @route   POST /api/reviews/:id/flag
// @access  Private (Merchant)
exports.flagReviewMerchant = async (req, res) => {
    try {
        const { reason, description } = req.body;
        const review = await Review.findById(req.params.id).populate('businessId');
        if (!review) return res.status(404).json({ msg: 'Review not found' });

        // Verify Ownership (Merchants can only flag reviews for their own business)
        if (review.businessId.owner.toString() !== req.user.id) {
            return res.status(403).json({ msg: 'Not authorized to flag this review' });
        }

        review.flags.push({
            flaggedBy: req.user.id,
            reason: reason || 'Fake',
            description,
            flaggedAt: new Date()
        });

        await review.save();
        res.json({ msg: 'Review flagged for admin review' });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
};

// @desc    Get aggregate review stats for merchant's businesses
// @route   GET /api/reviews/merchant/stats
// @access  Private (Merchant)
exports.getMerchantReviewStats = async (req, res) => {
    try {
        // Find all businesses owned by this merchant
        const companies = await Company.find({ owner: req.user.id }).select('_id');
        const companyIds = companies.map(c => c._id);

        if (companyIds.length === 0) {
            return res.json({
                averageRating: 0,
                totalReviews: 0,
                ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
                responseRate: 0
            });
        }

        const reviews = await Review.find({ 
            businessId: { $in: companyIds },
            isDeleted: { $ne: true }
        });

        const totalReviews = reviews.length;
        const ratingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        let sumRating = 0;
        let repliedCount = 0;

        reviews.forEach(r => {
            const star = Math.round(r.rating);
            if (ratingDistribution[star] !== undefined) ratingDistribution[star]++;
            sumRating += r.rating;
            if (r.ownerReply && r.ownerReply.text) repliedCount++;
        });

        res.json({
            averageRating: totalReviews > 0 ? parseFloat((sumRating / totalReviews).toFixed(1)) : 0,
            totalReviews,
            ratingDistribution,
            responseRate: totalReviews > 0 ? Math.round((repliedCount / totalReviews) * 100) : 0,
            repliedCount
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
};

// @desc    Get all reviews for merchant's businesses
// @route   GET /api/reviews/merchant/all
// @access  Private (Merchant)
exports.getMerchantReviews = async (req, res) => {
    try {
        const companies = await Company.find({ owner: req.user.id }).select('_id');
        const companyIds = companies.map(c => c._id);

        const reviews = await Review.find({ 
            businessId: { $in: companyIds },
            isDeleted: { $ne: true }
        })
        .populate('userId', 'name email image')
        .populate('businessId', 'name slug')
        .sort({ createdAt: -1 });

        res.json(reviews);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
};

// @desc    Get my review for a business
// @route   GET /api/reviews/my-review/:businessId
// @access  Private
exports.getMyReviewForBusiness = async (req, res) => {
    try {
        const review = await Review.findOne({ 
            businessId: req.params.businessId, 
            userId: req.user.id,
            isDeleted: { $ne: true }
        });

        if (!review) {
            return res.json(null);
        }

        res.json(review);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
};

// @desc    Update a review
// @route   PUT /api/reviews/:id
// @access  Private (Owner)
exports.updateUserReview = async (req, res) => {
    try {
        const { rating, comment, images, aspects } = req.body;
        
        let review = await Review.findById(req.params.id);
        if (!review) return res.status(404).json({ msg: 'Review not found' });

        // Verify Ownership
        if (review.userId.toString() !== req.user.id) {
            return res.status(403).json({ msg: 'Not authorized to edit this review' });
        }

        const oldStatus = review.status;

        // Add to edit history
        if (comment !== review.comment) {
            review.editHistory.push({
                oldComment: review.comment,
                editedAt: new Date()
            });
            review.isEdited = true;
            review.editedAt = new Date();
        }

        review.rating = rating || review.rating;
        review.comment = comment || review.comment;
        review.images = images || review.images;
        review.aspects = aspects || review.aspects;
        
        // Reset status to Pending for re-moderation
        review.status = 'Pending';

        await review.save();

        // Recalculate company rating if previous status was 'Approved'
        if (oldStatus === 'Approved') {
            await recalculateCompanyRating(review.businessId);
        }

        res.json(review);
    } catch (err) {
        console.error('Update Review Error:', err.message);
        if (err.name === 'ValidationError') {
            const messages = Object.values(err.errors).map(val => val.message);
            return res.status(400).json({ msg: messages.join(', ') });
        }
        res.status(500).json({ msg: 'Server Error' });
    }
};

module.exports = {
    addReview: exports.addReview,
    getBusinessReviews: exports.getBusinessReviews,
    getAllReviews: exports.getAllReviews,
    updateReviewStatus: exports.updateReviewStatus,
    deleteReview: exports.deleteReview,
    getLatestReviews: exports.getLatestReviews,
    getUserReviews: exports.getUserReviews,
    voteReview: exports.voteReview,
    reportReview: exports.reportReview,
    replyToReview: exports.replyToReview,
    flagReviewMerchant: exports.flagReviewMerchant,
    getMerchantReviewStats: exports.getMerchantReviewStats,
    getMerchantReviews: exports.getMerchantReviews,
    getMyReviewForBusiness: exports.getMyReviewForBusiness,
    updateUserReview: exports.updateUserReview
};
