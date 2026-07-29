const FraudAlert = require('../models/FraudAlert');
const Blacklist = require('../models/Blacklist');
const Company = require('../models/Company');
const Review = require('../models/Review');
const User = require('../models/User');
const Enquiry = require('../models/Enquiry');

// ==================== FRAUD DETECTION RULES ====================

// Rule 1: Duplicate phone numbers across listings
const checkDuplicatePhones = async () => {
    try {
        const duplicates = await Company.aggregate([
            {
                $group: {
                    _id: "$phone",
                    count: { $sum: 1 },
                    listings: { $push: { _id: "$_id", name: "$name", slug: "$slug" } }
                }
            },
            {
                $match: {
                    count: { $gte: 2 },
                    _id: { $ne: null, $ne: "" }
                }
            }
        ]);

        for (const dup of duplicates) {
            // Check if alert already exists
            const existingAlert = await FraudAlert.findOne({
                type: 'listing',
                reason: 'Duplicate phone number',
                'metadata.duplicateCount': dup.count,
                targetModel: 'Company'
            });

            if (!existingAlert) {
                // Create fraud alert for each listing with this phone
                for (const listing of dup.listings) {
                    await FraudAlert.create({
                        type: 'listing',
                        severity: dup.count > 3 ? 'high' : 'medium',
                        reason: 'Duplicate phone number',
                        description: `Phone number ${dup._id} appears on ${dup.count} listings`,
                        targetId: listing._id,
                        targetModel: 'Company',
                        metadata: {
                            duplicateCount: dup.count,
                            relatedIds: dup.listings.map(l => l._id).filter(id => !id.equals(listing._id))
                        }
                    });
                }
            }
        }

        console.log(`Checked duplicate phones: ${duplicates.length} issues found`);
    } catch (err) {
        console.error('Error in duplicate phone check:', err);
    }
};

// Rule 2: Duplicate address + category combinations
const checkDuplicateAddressCategory = async () => {
    try {
        const duplicates = await Company.aggregate([
            {
                $group: {
                    _id: {
                        address: "$address",
                        category: "$category"
                    },
                    count: { $sum: 1 },
                    listings: { $push: { _id: "$_id", name: "$name" } }
                }
            },
            {
                $match: {
                    count: { $gte: 2 },
                    "_id.address": { $ne: null, $ne: "" },
                    "_id.category": { $ne: null }
                }
            }
        ]);

        for (const dup of duplicates) {
            const existingAlert = await FraudAlert.findOne({
                type: 'listing',
                reason: 'Duplicate address + category',
                targetModel: 'Company'
            });

            if (!existingAlert) {
                for (const listing of dup.listings) {
                    await FraudAlert.create({
                        type: 'listing',
                        severity: 'medium',
                        reason: 'Duplicate address + category',
                        description: `Address "${dup._id.address}" with category "${dup._id.category}" appears on ${dup.count} listings`,
                        targetId: listing._id,
                        targetModel: 'Company',
                        metadata: {
                            duplicateCount: dup.count,
                            relatedIds: dup.listings.map(l => l._id).filter(id => !id.equals(listing._id))
                        }
                    });
                }
            }
        }

        console.log(`Checked duplicate address+category: ${duplicates.length} issues found`);
    } catch (err) {
        console.error('Error in duplicate address+category check:', err);
    }
};

// Rule 3: Reviews from same IP on same business
const checkReviewIPDuplicates = async () => {
    try {
        const suspiciousReviews = await Review.aggregate([
            {
                $match: {
                    status: 'Approved',
                    'metadata.ipAddress': { $exists: true, $ne: null }
                }
            },
            {
                $group: {
                    _id: {
                        businessId: "$businessId",
                        ipAddress: "$metadata.ipAddress"
                    },
                    count: { $sum: 1 },
                    reviews: { $push: { _id: "$_id", userId: "$userId", rating: "$rating" } }
                }
            },
            {
                $match: { count: { $gte: 2 } }
            }
        ]);

        for (const group of suspiciousReviews) {
            for (const review of group.reviews) {
                const existingAlert = await FraudAlert.findOne({
                    type: 'review',
                    reason: 'Multiple reviews from same IP',
                    targetId: review._id,
                    targetModel: 'Review'
                });

                if (!existingAlert) {
                    await FraudAlert.create({
                        type: 'review',
                        severity: 'high',
                        reason: 'Multiple reviews from same IP',
                        description: `IP ${group._id.ipAddress} posted ${group.count} reviews on the same business`,
                        targetId: review._id,
                        targetModel: 'Review',
                        metadata: {
                            ipAddress: group._id.ipAddress,
                            duplicateCount: group.count
                        }
                    });
                }
            }
        }

        console.log(`Checked review IP duplicates: ${suspiciousReviews.length} issues found`);
    } catch (err) {
        console.error('Error in review IP duplicate check:', err);
    }
};

// Rule 4: Accounts with 5+ reviews in 24 hours
const checkReviewVelocity = async () => {
    try {
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

        const velocityUsers = await Review.aggregate([
            {
                $match: {
                    createdAt: { $gte: twentyFourHoursAgo },
                    status: 'Approved'
                }
            },
            {
                $group: {
                    _id: "$userId",
                    reviewCount: { $sum: 1 },
                    reviews: { $push: { _id: "$_id", businessId: "$businessId" } }
                }
            },
            {
                $match: { reviewCount: { $gte: 5 } }
            }
        ]);

        for (const user of velocityUsers) {
            for (const review of user.reviews) {
                const existingAlert = await FraudAlert.findOne({
                    type: 'review',
                    reason: 'High review velocity',
                    targetId: review._id,
                    targetModel: 'Review'
                });

                if (!existingAlert) {
                    await FraudAlert.create({
                        type: 'review',
                        severity: 'high',
                        reason: 'High review velocity',
                        description: `User posted ${user.reviewCount} reviews in 24 hours`,
                        targetId: review._id,
                        targetModel: 'Review',
                        metadata: {
                            velocityScore: user.reviewCount
                        }
                    });
                }
            }
        }

        console.log(`Checked review velocity: ${velocityUsers.length} suspicious users found`);
    } catch (err) {
        console.error('Error in review velocity check:', err);
    }
};

// Rule 5: New accounts posting only 5-star reviews on one business
const checkFiveStarOnly = async () => {
    try {
        const suspiciousUsers = await Review.aggregate([
            {
                $match: {
                    status: 'Approved',
                    rating: 5
                }
            },
            {
                $group: {
                    _id: "$userId",
                    reviewCount: { $sum: 1 },
                    uniqueBusinesses: { $addToSet: "$businessId" },
                    ratings: { $push: "$rating" }
                }
            },
            {
                $match: {
                    reviewCount: { $gte: 3 },
                    uniqueBusinesses: { $size: 1 } // Only one business
                }
            }
        ]);

        for (const user of suspiciousUsers) {
            // Check if user is new (less than 7 days old)
            const userDoc = await User.findById(user._id);
            if (!userDoc) continue;

            const daysSinceRegistration = (Date.now() - userDoc.createdAt) / (1000 * 60 * 60 * 24);
            if (daysSinceRegistration > 7) continue;

            // Get all reviews by this user
            const userReviews = await Review.find({
                userId: user._id,
                status: 'Approved'
            });

            const allFiveStars = userReviews.every(review => review.rating === 5);

            if (allFiveStars) {
                for (const review of userReviews) {
                    const existingAlert = await FraudAlert.findOne({
                        type: 'review',
                        reason: 'Only 5-star reviews on one business',
                        targetId: review._id,
                        targetModel: 'Review'
                    });

                    if (!existingAlert) {
                        await FraudAlert.create({
                            type: 'review',
                            severity: 'medium',
                            reason: 'Only 5-star reviews on one business',
                            description: `New user (${daysSinceRegistration.toFixed(1)} days old) posted only 5-star reviews on one business`,
                            targetId: review._id,
                            targetModel: 'Review',
                            metadata: {
                                daysSinceRegistration: daysSinceRegistration
                            }
                        });
                    }
                }
            }
        }

        console.log(`Checked 5-star only reviews: ${suspiciousUsers.length} suspicious users found`);
    } catch (err) {
        console.error('Error in 5-star only check:', err);
    }
};

// ==================== VELOCITY CHECKING ====================

const checkUserVelocity = async (userId, action = 'general') => {
    try {
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

        // Count recent actions (this would need to be implemented based on your audit logs)
        const recentActions = await require('../models/AdminAuditLog').countDocuments({
            adminId: userId,
            createdAt: { $gte: fiveMinutesAgo }
        });

        if (recentActions >= 20) {
            await FraudAlert.create({
                type: 'account',
                severity: 'critical',
                reason: 'High velocity actions',
                description: `${recentActions} actions in 5 minutes`,
                targetId: userId,
                targetModel: 'User',
                metadata: {
                    velocityScore: recentActions,
                    actionType: action
                }
            });
            return true; // Blocked
        }

        return false;
    } catch (err) {
        console.error('Error in velocity check:', err);
        return false;
    }
};

// ==================== BLACKLIST CHECKS ====================

const checkBlacklist = async (type, value) => {
    return await Blacklist.isBlacklisted(type, value);
};

// ==================== MAIN FRAUD DETECTION CONTROLLER ====================

// Run all fraud detection rules
const runFraudDetection = async (req, res) => {
    try {
        console.log('Starting fraud detection scan...');

        await Promise.all([
            checkDuplicatePhones(),
            checkDuplicateAddressCategory(),
            checkReviewIPDuplicates(),
            checkReviewVelocity(),
            checkFiveStarOnly()
        ]);

        res.json({ success: true, message: 'Fraud detection scan completed' });
    } catch (err) {
        console.error('Fraud detection error:', err);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// Get fraud alerts dashboard
const getFraudDashboard = async (req, res) => {
    try {
        const { type, status, severity, page = 1, limit = 20 } = req.query;

        let query = {};
        if (type) query.type = type;
        if (status) query.status = status;
        if (severity) query.severity = severity;

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const alerts = await FraudAlert.find(query)
            .populate('targetId', 'name title email')
            .populate('assignedTo', 'name')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const total = await FraudAlert.countDocuments(query);

        // Get today's summary
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const todayStats = await FraudAlert.aggregate([
            {
                $match: {
                    createdAt: { $gte: today, $lt: tomorrow }
                }
            },
            {
                $group: {
                    _id: { type: '$type', severity: '$severity' },
                    count: { $sum: 1 }
                }
            }
        ]);

        res.json({
            success: true,
            alerts,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / parseInt(limit))
            },
            todayStats
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// Assign fraud alert to moderator
const assignFraudAlert = async (req, res) => {
    try {
        const { alertId } = req.params;
        const { moderatorId } = req.body;

        const alert = await FraudAlert.findByIdAndUpdate(
            alertId,
            {
                assignedTo: moderatorId,
                status: 'investigating'
            },
            { new: true }
        ).populate('assignedTo', 'name');

        if (!alert) {
            return res.status(404).json({ success: false, msg: 'Fraud alert not found' });
        }

        res.json({ success: true, alert });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// Moderator actions on fraud alerts
const moderateFraudAlert = async (req, res) => {
    try {
        const { alertId } = req.params;
        const { action, reason } = req.body;

        const alert = await FraudAlert.findById(alertId);
        if (!alert) {
            return res.status(404).json({ success: false, msg: 'Fraud alert not found' });
        }

        alert.moderatorAction = {
            action,
            reason,
            moderatorId: req.user._id,
            timestamp: new Date()
        };

        if (action === 'dismiss') {
            alert.status = 'dismissed';
            alert.isResolved = true;
            alert.resolvedAt = new Date();
        } else if (action === 'suspend_listing' && alert.targetModel === 'Company') {
            // Suspend the listing
            await Company.findByIdAndUpdate(alert.targetId, { status: 'Suspended' });
            alert.status = 'confirmed';
            alert.isResolved = true;
            alert.resolvedAt = new Date();
        } else if (action === 'suspend_account' && alert.targetModel === 'User') {
            // Suspend the account
            await User.findByIdAndUpdate(alert.targetId, { status: 'Suspended' });
            alert.status = 'confirmed';
            alert.isResolved = true;
            alert.resolvedAt = new Date();
        } else if (action === 'quarantine' && alert.targetModel === 'Review') {
            // Reject the review and potentially suspend user
            await Review.findByIdAndUpdate(alert.targetId, { status: 'Rejected', moderationNotes: reason });
            alert.status = 'confirmed';
            alert.isResolved = true;
            alert.resolvedAt = new Date();
        }

        await alert.save();

        res.json({ success: true, alert });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// Bulk quarantine accounts
const bulkQuarantineAccounts = async (req, res) => {
    try {
        const { alertIds, reason } = req.body;

        const alerts = await FraudAlert.find({
            _id: { $in: alertIds },
            targetModel: 'User',
            status: 'pending'
        });

        const userIds = alerts.map(alert => alert.targetId);

        // Suspend all accounts
        await User.updateMany(
            { _id: { $in: userIds } },
            { status: 'Suspended' }
        );

        // Update alerts
        await FraudAlert.updateMany(
            { _id: { $in: alertIds } },
            {
                status: 'confirmed',
                isResolved: true,
                resolvedAt: new Date(),
                moderatorAction: {
                    action: 'quarantine',
                    reason,
                    moderatorId: req.user._id,
                    timestamp: new Date()
                }
            }
        );

        res.json({
            success: true,
            message: `Quarantined ${userIds.length} accounts`
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// ==================== BLACKLIST MANAGEMENT ====================

// Get all blacklist entries
const getBlacklist = async (req, res) => {
    try {
        const { type, page = 1, limit = 20 } = req.query;

        let query = {};
        if (type) query.type = type;

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const entries = await Blacklist.find(query)
            .populate('addedBy', 'name')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const total = await Blacklist.countDocuments(query);

        res.json({
            success: true,
            entries,
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

// Add to blacklist
const addToBlacklist = async (req, res) => {
    try {
        const { type, value, reason, severity, expiresAt } = req.body;

        const entry = new Blacklist({
            type,
            value,
            reason,
            severity,
            addedBy: req.user._id,
            expiresAt: expiresAt ? new Date(expiresAt) : null
        });

        await entry.save();
        await entry.populate('addedBy', 'name');

        res.status(201).json({ success: true, entry });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// Remove from blacklist
const removeFromBlacklist = async (req, res) => {
    try {
        const { id } = req.params;

        await Blacklist.findByIdAndUpdate(id, { isActive: false });

        res.json({ success: true, message: 'Entry removed from blacklist' });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// Import blacklist from CSV
const importBlacklistCSV = async (req, res) => {
    try {
        // This would parse CSV and create blacklist entries
        // For now, return placeholder
        res.json({ success: true, message: 'CSV import functionality to be implemented' });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// ==================== CONTENT SPAM CHECK ====================

const checkContentForSpam = (text) => {
    if (!text) return { isSpam: false };

    const spamKeywords = [
        'buy cheap', 'viagra', 'casino', 'betting', 'earn money fast',
        'crypto investment', 'whatsapp me', 'telegram me', 'low price guarantee',
        'weight loss fast', 'lottery winner', 'urgent prize', 'pills online'
    ];

    const foundKeywords = spamKeywords.filter(keyword => 
        text.toLowerCase().includes(keyword.toLowerCase())
    );

    // Also check for excessive special characters or repetitive text
    const specialChars = (text.match(/[!?;:,$%^&*()]/g) || []).length;
    const specialRatio = specialChars / text.length;

    if (foundKeywords.length > 0) {
        return { isSpam: true, reason: `Spam keywords: ${foundKeywords.join(', ')}` };
    }

    if (specialRatio > 0.2 && text.length > 50) {
        return { isSpam: true, reason: 'Excessive special characters' };
    }

    return { isSpam: false };
};

// ==================== REAL-TIME FRAUD CHECK ====================

const realTimeFraudCheck = async (type, data, userId, metadata = {}) => {
    try {
        const issuesFound = [];
        let severity = 'low';

        // 1. Blacklist Checks
        if (metadata.ipAddress && await Blacklist.isBlacklisted('ip', metadata.ipAddress)) {
            issuesFound.push({ reason: 'Blacklisted IP address', severity: 'high' });
        }
        if (data.phone && await Blacklist.isBlacklisted('phone', data.phone)) {
            issuesFound.push({ reason: 'Blacklisted phone number', severity: 'high' });
        }
        if (data.email && await Blacklist.isBlacklisted('email', data.email)) {
            issuesFound.push({ reason: 'Blacklisted email address', severity: 'high' });
        }

        // 2. Content Checks
        const contentToCheck = type === 'listing' ? `${data.name} ${data.description}` : data.comment;
        const contentResult = checkContentForSpam(contentToCheck);
        if (contentResult.isSpam) {
            issuesFound.push({ reason: contentResult.reason, severity: 'medium' });
        }

        // 3. Duplicate Checks (Real-time)
        if (type === 'listing' && data.phone) {
            const existing = await Company.findOne({ phone: data.phone, status: { $ne: 'Rejected' }, _id: { $ne: data._id } });
            if (existing) {
                issuesFound.push({ reason: 'Duplicate phone number detected', severity: 'medium' });
            }
        }

        if (type === 'review') {
            const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
            const userRecentReviews = await Review.countDocuments({
                userId,
                createdAt: { $gte: twentyFourHoursAgo }
            });

            if (userRecentReviews >= 5) {
                issuesFound.push({ reason: 'High review velocity (5+ in 24h)', severity: 'high' });
            }

            if (metadata.ipAddress) {
                const ipDuplicates = await Review.countDocuments({
                    businessId: data.businessId,
                    'metadata.ipAddress': metadata.ipAddress,
                    status: 'Approved'
                });
                if (ipDuplicates >= 1) {
                    issuesFound.push({ reason: 'Multiple reviews from same IP on this business', severity: 'medium' });
                }
            }
        }

        if (issuesFound.length > 0) {
            // Determine combined severity
            if (issuesFound.some(a => a.severity === 'high')) severity = 'high';
            else if (issuesFound.some(a => a.severity === 'medium')) severity = 'medium';

            const alertData = {
                type,
                severity,
                reason: issuesFound[0].reason,
                description: `Detected suspicious activity: ${issuesFound.map(a => a.reason).join('; ')}`,
                targetModel: type === 'listing' ? 'Company' : (type === 'review' ? 'Review' : 'User'),
                metadata: {
                    ...metadata,
                    relatedReasons: issuesFound.map(a => a.reason)
                }
            };

            return {
                isSuspicious: true,
                severity,
                reasons: issuesFound.map(a => a.reason),
                alertData
            };
        }

        return { isSuspicious: false };
    } catch (err) {
        console.error('Real-time fraud check error:', err);
        return { isSuspicious: false };
    }
};

// Export blacklist to CSV
const exportBlacklistCSV = async (req, res) => {
    try {
        const entries = await Blacklist.find({ isActive: true });

        // Convert to CSV format
        const csvData = entries.map(entry => ({
            type: entry.type,
            value: entry.value,
            reason: entry.reason,
            severity: entry.severity,
            addedBy: entry.addedBy?.name || 'Unknown',
            createdAt: entry.createdAt.toISOString()
        }));

        res.json({ success: true, data: csvData });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

module.exports = {
    runFraudDetection,
    getFraudDashboard,
    assignFraudAlert,
    moderateFraudAlert,
    bulkQuarantineAccounts,
    getBlacklist,
    addToBlacklist,
    removeFromBlacklist,
    importBlacklistCSV,
    exportBlacklistCSV,
    checkUserVelocity,
    checkBlacklist,
    realTimeFraudCheck
};