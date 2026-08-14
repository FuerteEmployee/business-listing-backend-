const Company = require('../models/Company');
const AdminAuditLog = require('../models/AdminAuditLog');
const User = require('../models/User');
const Review = require('../models/Review');
const RBACRole = require('../models/RBACRole');
const mongoose = require('mongoose');
const { resolveManualLocation } = require('../utils/resolveManualLocation');
const nodemailer = require('nodemailer');

/**
 * Same resolution rules as the checkPermission middleware, for endpoints that
 * gate more than one distinct permission behind a single route (e.g. a bulk
 * endpoint whose requested action needs 'approve' for approve/reject but
 * 'delete' for delete).
 */
const hasPermission = async (user, moduleName, action) => {
    if (!user || !user.role) return false;
    if (user.role === 'Super Admin') return true;
    const role = await RBACRole.findOne({ name: user.role });
    return !!(role && role.permissions && role.permissions[moduleName] && role.permissions[moduleName][action] === true);
};

/**
 * Shared catch-block error responder: turns a Mongoose ValidationError into a
 * clean 400 with field-level messages (matching createListingAdmin's existing
 * handling) instead of the generic 500 most handlers in this file fall back to.
 */
/** Escape regex metacharacters before interpolating user/DB text into a $regex filter. */
const escapeRegex = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const sendCaughtError = (res, err, fallbackMsg = 'Server Error') => {
    console.error(err.message);
    if (err.name === 'ValidationError') {
        const fieldErrors = Object.entries(err.errors || {}).map(
            ([field, e]) => `${field}: ${e.message}`
        );
        return res.status(400).json({ success: false, msg: 'Validation failed', errors: fieldErrors });
    }
    return res.status(500).json({ success: false, msg: fallbackMsg, error: err.message });
};

// Configure nodemailer
const transporter = nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE || 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
    }
});

// ==================== LISTING LIST & FILTERS ====================

// @desc    Get all listings with filters and sorting
// @route   GET /api/admin/listings
exports.getAllListingsAdmin = async (req, res) => {
    try {
        const { 
            search, 
            status, 
            category, 
            city, 
            plan,
            sortBy = '-createdAt', 
            page = 1, 
            limit = 20,
            dateStart,
            dateEnd
        } = req.query;

        let query = {};
        const conditions = [];

        // Search by business name, phone, or owner email
        if (search) {
            conditions.push({
                $or: [
                    { name: { $regex: escapeRegex(search), $options: 'i' } },
                    { phone: { $regex: escapeRegex(search), $options: 'i' } },
                    { email: { $regex: escapeRegex(search), $options: 'i' } }
                ]
            });
        }

        // Filter by status
        if (status) {
            if (status === 'PendingApproval' || status === 'Pending') {
                conditions.push({
                    $or: [
                        { status: 'Pending' },
                        { 'approvalStatus.stage': { $in: ['AwaitingReview', 'UnderReview', 'Pending'] } }
                    ]
                });
            } else if (status === 'Approved' || status === 'Active') {
                conditions.push({
                    $or: [
                        { status: { $in: ['Approved', 'Active'] } },
                        { 'approvalStatus.stage': 'Approved' }
                    ]
                });
            } else if (status === 'Rejected') {
                conditions.push({
                    $or: [
                        { status: 'Rejected' },
                        { 'approvalStatus.stage': 'Rejected' }
                    ]
                });
            } else if (status === 'Flagged') {
                conditions.push({
                    $or: [
                        { status: 'Flagged' },
                        { isFlagged: true }
                    ]
                });
            } else {
                conditions.push({
                    $or: [
                        { status: status },
                        { 'approvalStatus.stage': status }
                    ]
                });
            }
        }

        // Filter by category
        if (category) {
            query.category_id = category;
        }

        // Filter by city
        if (city) {
            query.city_id = city;
        }

        // Filter by plan
        if (plan) {
            query.plan = plan;
        }

        // Filter by date range
        if (dateStart || dateEnd) {
            query.createdAt = {};
            if (dateStart) query.createdAt.$gte = new Date(dateStart);
            if (dateEnd) {
                const end = new Date(dateEnd);
                end.setHours(23, 59, 59, 999);
                query.createdAt.$lte = end;
            }
        }

        if (conditions.length > 0) {
            query.$and = conditions;
        }

        // Pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);

        // Build sort
        const sortObj = {};
        if (sortBy.startsWith('-')) {
            sortObj[sortBy.substring(1)] = -1;
        } else {
            sortObj[sortBy] = 1;
        }

        // For pending approval, sort by oldest first
        if (status === 'PendingApproval') {
            sortObj.createdAt = 1;
        }

        const listings = await Company.find(query)
            .populate('owner', 'name email')
            .populate('category_id', 'name')
            .populate('city_id', 'name')
            .sort(sortObj)
            .skip(skip)
            .limit(parseInt(limit));

        const total = await Company.countDocuments(query);

        res.json({
            success: true,
            listings,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (err) {
        return sendCaughtError(res, err);
    }
};

// @desc    Update listing rank (Assign Order)
// @route   PUT /api/admin/listings/:id/rank
exports.updateListingRank = async (req, res) => {
    try {
        const { rank } = req.body;
        
        const listing = await Company.findByIdAndUpdate(
            req.params.id,
            { manualRank: parseInt(rank) || 0 },
            { new: true }
        );

        if (!listing) {
            return res.status(404).json({ success: false, msg: 'Listing not found' });
        }

        if (AdminAuditLog) {
            await AdminAuditLog.create({
                action: 'LISTING_EDITED',
                targetType: 'Listing',
                targetId: listing._id,
                adminId: req.user?._id,
                notes: `Updated rank to ${rank}`,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent']
            });
        }

        res.json({
            success: true,
            msg: 'Listing rank updated successfully',
            listing
        });
    } catch (err) {
        console.error('Update Rank Error:', err);
        res.status(500).json({ success: false, msg: 'Server Error' });
    }
};

// @desc    Bulk update listing ranks
// @route   POST /api/admin/listings/bulk-reorder
exports.bulkReorderListings = async (req, res) => {
    try {
        const { ranks } = req.body; // Array of { id, rank }

        if (!Array.isArray(ranks)) {
            return res.status(400).json({ success: false, msg: 'Invalid ranks data' });
        }

        // Skip malformed ids instead of letting one bad id abort the whole batch.
        const validRanks = ranks.filter(item => mongoose.Types.ObjectId.isValid(item?.id));
        const skippedInvalidIds = ranks.length - validRanks.length;

        const bulkOps = validRanks.map(item => ({
            updateOne: {
                filter: { _id: item.id },
                update: { $set: { manualRank: parseInt(item.rank) || 0 } }
            }
        }));

        if (bulkOps.length > 0) {
            await Company.bulkWrite(bulkOps);
        }

        await AdminAuditLog.create({
            adminId: req.user?._id,
            action: 'LISTING_EDITED',
            targetType: 'Listing',
            notes: `Bulk-reordered ${bulkOps.length} listings` + (skippedInvalidIds ? ` (${skippedInvalidIds} invalid id(s) skipped)` : ''),
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        });

        res.json({
            success: true,
            msg: 'Listings reordered successfully',
            skippedInvalidIds
        });
    } catch (err) {
        return sendCaughtError(res, err);
    }
};

// ==================== LISTING DETAIL & APPROVAL ====================

// @desc    Get listing detail for approval/review
// @route   GET /api/admin/listings/:id
exports.getListingDetailAdmin = async (req, res) => {
    try {
        const { id } = req.params;
        let query = {};
        if (id.match(/^[0-9a-fA-F]{24}$/)) {
            query = { _id: id };
        } else {
            query = { slug: id };
        }

        const listing = await Company.findOne(query)
            .populate('owner', 'name email phone')
            .populate('category_id', 'name')
            .populate('city_id', 'name')
            .populate('changeHistory.changedBy', 'name email');

        if (!listing) {
            return res.status(404).json({ success: false, msg: 'Listing not found' });
        }

        // Get reviews for this listing
        const reviewDocs = await Review.find({ businessId: listing._id })
            .populate('userId', 'name')
            .select('rating comment status createdAt userId authorName')
            .limit(20);

        // Fall back to the name captured at write time when the author was
        // since hard-deleted (populate resolves the dangling ref to null),
        // so the admin sees "Deleted user" instead of a broken lookup.
        const reviews = reviewDocs.map(r => {
            const obj = r.toObject();
            obj.authorDisplayName = obj.userId?.name || obj.authorName || 'Deleted user';
            return obj;
        });

        res.json({
            success: true,
            listing,
            reviews,
            reviewStats: {
                totalReviews: reviews.length,
                averageRating: listing.rating,
                pendingReviews: reviews.filter(r => r.status === 'Pending').length
            }
        });
    } catch (err) {
        return sendCaughtError(res, err);
    }
};

// ==================== LISTING APPROVAL WORKFLOW ====================

// @desc    Approve listing
// @route   PUT /api/admin/listings/:id/approve
exports.approveListing = async (req, res) => {
    try {
        const listing = await Company.findById(req.params.id);
        if (!listing) {
            return res.status(404).json({ success: false, msg: 'Listing not found' });
        }

        const oldStatus = listing.status;
        listing.status = 'Approved';
        listing.approvalStatus.stage = 'Approved';
        listing.approvalStatus.reviewedBy = req.user._id;
        listing.approvalStatus.reviewedAt = new Date();
        // Approving resolves any prior flag — otherwise the listing keeps
        // matching the "Flagged" filter forever after being re-approved.
        listing.isFlagged = false;
        await listing.save();

        // Log audit
        await AdminAuditLog.create({
            adminId: req.user._id,
            action: 'LISTING_APPROVED',
            targetType: 'Listing',
            targetId: listing._id,
            changes: {
                before: { status: oldStatus },
                after: { status: 'Approved' }
            },
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        });

        // Send email to owner
        if (listing.email) {
            const mailOptions = {
                from: process.env.EMAIL_USER,
                to: listing.email,
                subject: 'Your Listing Has Been Approved',
                html: `<h2>Listing Approved</h2><p>Your business listing "${listing.name}" has been approved and is now live on our platform.</p>`
            };
            transporter.sendMail(mailOptions, (err) => {
                if (err) console.error('Email send error:', err);
            });
        }

        res.json({ success: true, msg: 'Listing approved successfully', listing });
    } catch (err) {
        return sendCaughtError(res, err);
    }
};

// @desc    Reject listing
// @route   PUT /api/admin/listings/:id/reject
exports.rejectListing = async (req, res) => {
    try {
        const { reason } = req.body;

        if (!reason) {
            return res.status(400).json({ success: false, msg: 'Rejection reason is required' });
        }

        const listing = await Company.findById(req.params.id);
        if (!listing) {
            return res.status(404).json({ success: false, msg: 'Listing not found' });
        }

        const oldStatus = listing.status;
        listing.status = 'Rejected';
        listing.approvalStatus.stage = 'Rejected';
        listing.approvalStatus.reviewedBy = req.user._id;
        listing.approvalStatus.reviewedAt = new Date();
        listing.approvalStatus.rejectionReason = reason;
        listing.isFlagged = false;
        await listing.save();

        // Log audit
        await AdminAuditLog.create({
            adminId: req.user._id,
            action: 'LISTING_REJECTED',
            targetType: 'Listing',
            targetId: listing._id,
            changes: {
                before: { status: oldStatus },
                after: { status: 'Rejected', reason }
            },
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        });

        // Send email notification
        if (listing.email) {
            const mailOptions = {
                from: process.env.EMAIL_USER,
                to: listing.email,
                subject: 'Your Listing Was Not Approved',
                html: `<h2>Listing Not Approved</h2><p>Your business listing application was not approved.</p><p><strong>Reason:</strong> ${reason}</p>`
            };
            transporter.sendMail(mailOptions, (err) => {
                if (err) console.error('Email send error:', err);
            });
        }

        res.json({ success: true, msg: 'Listing rejected successfully', listing });
    } catch (err) {
        return sendCaughtError(res, err);
    }
};

// @desc    Request more info from merchant
// @route   PUT /api/admin/listings/:id/request-info
exports.requestMoreInfo = async (req, res) => {
    try {
        const { message } = req.body;

        if (!message) {
            return res.status(400).json({ success: false, msg: 'Message is required' });
        }

        const listing = await Company.findById(req.params.id);
        if (!listing) {
            return res.status(404).json({ success: false, msg: 'Listing not found' });
        }

        listing.approvalStatus.stage = 'MoreInfoRequested';
        listing.approvalStatus.moreInfoRequestedAt = new Date();
        listing.approvalStatus.moreInfoMessage = message;
        await listing.save();

        // Log audit
        await AdminAuditLog.create({
            adminId: req.user._id,
            action: 'LISTING_INFO_REQUESTED',
            targetType: 'Listing',
            targetId: listing._id,
            notes: message,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        });

        res.json({ success: true, msg: 'Info request sent to merchant', listing });
    } catch (err) {
        return sendCaughtError(res, err);
    }
};

// ==================== LISTING ACTIONS ====================

// @desc    Verify business badge (blue tick)
// @route   PUT /api/admin/listings/:id/verify-badge
exports.verifyBusinessBadge = async (req, res) => {
    try {
        const listing = await Company.findById(req.params.id);
        if (!listing) {
            return res.status(404).json({ success: false, msg: 'Listing not found' });
        }

        listing.businessBadgeVerified = true;
        listing.badgeVerifiedBy = req.user._id;
        listing.badgeVerifiedAt = new Date();
        await listing.save();

        // Log audit
        await AdminAuditLog.create({
            adminId: req.user._id,
            action: 'LISTING_EDITED',
            targetType: 'Listing',
            targetId: listing._id,
            notes: 'Business badge verified',
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        });

        res.json({ success: true, msg: 'Business badge verified', listing });
    } catch (err) {
        return sendCaughtError(res, err);
    }
};

// @desc    Flag listing as spam/inappropriate
// @route   PUT /api/admin/listings/:id/flag
exports.flagListing = async (req, res) => {
    try {
        const { reason, description } = req.body;

        if (!reason) {
            return res.status(400).json({ success: false, msg: 'Flag reason is required' });
        }

        const listing = await Company.findById(req.params.id);
        if (!listing) {
            return res.status(404).json({ success: false, msg: 'Listing not found' });
        }

        listing.flags.push({
            reason,
            description,
            flaggedBy: req.user._id,
            flaggedAt: new Date()
        });
        listing.isFlagged = true;
        listing.status = 'Flagged';
        await listing.save();

        // Log audit
        await AdminAuditLog.create({
            adminId: req.user._id,
            action: 'LISTING_FLAGGED',
            targetType: 'Listing',
            targetId: listing._id,
            notes: `${reason}: ${description || ''}`,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        });

        res.json({ success: true, msg: 'Listing flagged successfully', listing });
    } catch (err) {
        return sendCaughtError(res, err);
    }
};

// @desc    Suspend listing (hidden from public)
// @route   PUT /api/admin/listings/:id/suspend
exports.suspendListing = async (req, res) => {
    try {
        const { reason } = req.body;

        const listing = await Company.findById(req.params.id);
        if (!listing) {
            return res.status(404).json({ success: false, msg: 'Listing not found' });
        }

        listing.status = 'Suspended';
        listing.suspensionDetails = {
            reason,
            suspendedBy: req.user._id,
            suspendedAt: new Date(),
            notificationSent: false
        };
        await listing.save();

        // Log audit
        await AdminAuditLog.create({
            adminId: req.user._id,
            action: 'LISTING_SUSPENDED',
            targetType: 'Listing',
            targetId: listing._id,
            notes: reason,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        });

        res.json({ success: true, msg: 'Listing suspended successfully', listing });
    } catch (err) {
        return sendCaughtError(res, err);
    }
};

// @desc    Delete listing permanently
// @route   DELETE /api/admin/listings/:id
exports.deleteListing = async (req, res) => {
    try {
        const listing = await Company.findById(req.params.id);
        if (!listing) {
            return res.status(404).json({ success: false, msg: 'Listing not found' });
        }

        await Company.findByIdAndDelete(req.params.id);

        // Log audit
        await AdminAuditLog.create({
            adminId: req.user._id,
            action: 'LISTING_DELETED',
            targetType: 'Listing',
            targetId: req.params.id,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        });

        res.json({ success: true, msg: 'Listing deleted permanently' });
    } catch (err) {
        return sendCaughtError(res, err);
    }
};

// @desc    Check for duplicate listings
// @route   GET /api/admin/listings/:id/check-duplicates
exports.checkDuplicates = async (req, res) => {
    try {
        const listing = await Company.findById(req.params.id);
        if (!listing) {
            return res.status(404).json({ success: false, msg: 'Listing not found' });
        }

        // Find listings with same phone or email
        const duplicates = await Company.find({
            _id: { $ne: listing._id },
            $or: [
                { phone: listing.phone },
                { email: listing.email },
                { name: { $regex: escapeRegex(listing.name), $options: 'i' } }
            ]
        }).select('name phone email city_id');

        res.json({
            success: true,
            duplicates,
            hasPossibleDuplicates: duplicates.length > 0
        });
    } catch (err) {
        return sendCaughtError(res, err);
    }
};

// @desc    Bulk listing actions (approve, reject, delete)
// @route   POST /api/admin/listings/bulk-action
exports.bulkListingAction = async (req, res) => {
    try {
        const { ids, action, reason } = req.body;

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ success: false, msg: 'No listing IDs provided' });
        }

        const validActions = ['approve', 'reject', 'delete'];
        if (!validActions.includes(action)) {
            return res.status(400).json({ success: false, msg: 'Invalid bulk action' });
        }

        if (action === 'reject' && !reason) {
            return res.status(400).json({ success: false, msg: 'Rejection reason is required' });
        }

        // Delete needs the stronger 'delete' permission; approve/reject need 'approve' —
        // matching what the equivalent single-item routes require. Without this, a role
        // granted only 'write' (not 'approve'/'delete') could mass-approve/reject/delete
        // via this one endpoint despite being correctly blocked on the single-item routes.
        const requiredAction = action === 'delete' ? 'delete' : 'approve';
        if (!(await hasPermission(req.user, 'listingManagement', requiredAction))) {
            return res.status(403).json({
                success: false,
                msg: `Access Denied: You do not have '${requiredAction}' permission for 'listingManagement'`
            });
        }

        // Skip malformed ids instead of letting one bad id abort the entire batch.
        const validIds = ids.filter(id => mongoose.Types.ObjectId.isValid(id));
        const skippedInvalidIds = ids.length - validIds.length;
        if (validIds.length === 0) {
            return res.status(400).json({ success: false, msg: 'No valid listing IDs provided' });
        }

        let result;
        if (action === 'delete') {
            result = await Company.deleteMany({ _id: { $in: validIds } });

            // Log audit for deletion
            await AdminAuditLog.create({
                adminId: req.user._id,
                action: 'LISTING_BULK_DELETED',
                targetType: 'Listing',
                notes: `Deleted ${result.deletedCount} listings` + (skippedInvalidIds ? ` (${skippedInvalidIds} invalid id(s) skipped)` : ''),
                ipAddress: req.ip,
                userAgent: req.headers['user-agent']
            });
        } else {
            const statusMap = {
                approve: 'Approved',
                reject: 'Rejected'
            };

            const stageMap = {
                approve: 'Approved',
                reject: 'Rejected'
            };

            const updateData = {
                status: statusMap[action],
                'approvalStatus.stage': stageMap[action],
                'approvalStatus.reviewedBy': req.user._id,
                'approvalStatus.reviewedAt': new Date(),
                // Approving/rejecting resolves any prior flag — otherwise the listing
                // keeps matching the "Flagged" filter forever after being re-approved.
                isFlagged: false
            };

            if (action === 'reject') {
                updateData['approvalStatus.rejectionReason'] = reason;
            }

            result = await Company.updateMany(
                { _id: { $in: validIds } },
                { $set: updateData }
            );

            // Log audit
            await AdminAuditLog.create({
                adminId: req.user._id,
                action: action === 'approve' ? 'LISTING_BULK_APPROVED' : 'LISTING_BULK_REJECTED',
                targetType: 'Listing',
                notes: `${action === 'approve' ? 'Approved' : 'Rejected'} ${result.modifiedCount} listings` + (skippedInvalidIds ? ` (${skippedInvalidIds} invalid id(s) skipped)` : ''),
                changes: { after: { status: statusMap[action], reason } },
                ipAddress: req.ip,
                userAgent: req.headers['user-agent']
            });
        }

        res.json({
            success: true,
            msg: `Bulk ${action} successful`,
            affectedCount: result.modifiedCount || result.deletedCount || 0,
            skippedInvalidIds
        });
    } catch (err) {
        return sendCaughtError(res, err);
    }
};

// @desc    Export listings to CSV
// @route   GET /api/admin/listings/export/csv
exports.exportListingsCsv = async (req, res) => {
    try {
        const { search, status, category, city, plan, dateStart, dateEnd } = req.query;

        let query = {};
        const conditions = [];

        if (search) {
            conditions.push({
                $or: [
                    { name: { $regex: escapeRegex(search), $options: 'i' } },
                    { phone: { $regex: escapeRegex(search), $options: 'i' } },
                    { email: { $regex: escapeRegex(search), $options: 'i' } }
                ]
            });
        }

        if (status) {
            if (status === 'PendingApproval' || status === 'Pending') {
                conditions.push({
                    $or: [
                        { status: 'Pending' },
                        { 'approvalStatus.stage': { $in: ['AwaitingReview', 'UnderReview', 'Pending'] } }
                    ]
                });
            } else if (status === 'Approved' || status === 'Active') {
                conditions.push({
                    $or: [
                        { status: { $in: ['Approved', 'Active'] } },
                        { 'approvalStatus.stage': 'Approved' }
                    ]
                });
            } else if (status === 'Rejected') {
                conditions.push({
                    $or: [
                        { status: 'Rejected' },
                        { 'approvalStatus.stage': 'Rejected' }
                    ]
                });
            } else if (status === 'Flagged') {
                conditions.push({
                    $or: [
                        { status: 'Flagged' },
                        { isFlagged: true }
                    ]
                });
            } else {
                conditions.push({
                    $or: [
                        { status: status },
                        { 'approvalStatus.stage': status }
                    ]
                });
            }
        }

        if (category) query.category_id = category;
        if (city) query.city_id = city;
        if (plan) query.plan = plan;
        if (dateStart || dateEnd) {
            query.createdAt = {};
            if (dateStart) query.createdAt.$gte = new Date(dateStart);
            if (dateEnd) {
                const end = new Date(dateEnd);
                end.setHours(23, 59, 59, 999);
                query.createdAt.$lte = end;
            }
        }

        if (conditions.length > 0) {
            query.$and = conditions;
        }

        const listings = await Company.find(query)
            .populate('owner', 'name email')
            .populate('category_id', 'name')
            .populate('city_id', 'name')
            .populate('plan', 'name')
            .sort('-createdAt');

        // Generate CSV content
        const headers = ['Business Name', 'Owner', 'Email', 'Phone', 'Category', 'City', 'Plan', 'Status', 'Verified', 'Created At'];
        const rows = listings.map(l => [
            l.name,
            l.owner?.name || 'N/A',
            l.email || l.owner?.email || 'N/A',
            l.phone || 'N/A',
            l.category_id?.name || l.category || 'N/A',
            l.city_id?.name || 'N/A',
            l.plan?.name || 'Free',
            l.status,
            l.verified ? 'Yes' : 'No',
            l.createdAt ? new Date(l.createdAt).toLocaleDateString() : ''
        ]);

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${(cell || '').toString().replace(/"/g, '""')}"`).join(','))
        ].join('\n');

        await AdminAuditLog.create({
            adminId: req.user?._id,
            action: 'LISTING_EXPORTED',
            targetType: 'Listing',
            notes: `Exported ${listings.length} listings to CSV`,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        });

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=listings_export_${new Date().getTime()}.csv`);
        res.status(200).send(csvContent);

    } catch (err) {
        return sendCaughtError(res, err);
    }
};

// @desc    Get change history (audit trail) for a listing
// @route   GET /api/admin/listings/:id/audit
exports.getListingAuditTrail = async (req, res) => {
    try {
        const listing = await Company.findById(req.params.id)
            .populate('changeHistory.changedBy', 'name email')
            .select('name changeHistory');

        if (!listing) {
            return res.status(404).json({ success: false, msg: 'Listing not found' });
        }

        res.json({
            success: true,
            listingName: listing.name,
            auditTrail: listing.changeHistory.sort((a, b) => b.date - a.date)
        });
    } catch (err) {
        return sendCaughtError(res, err);
    }
};

// @desc    Create a new listing by admin
// @route   POST /api/admin/listings
exports.createListingAdmin = async (req, res) => {
    try {
        const payload = { ...req.body };
        const { name, category, status = 'Active' } = payload;

        if (!name || !category) {
            return res.status(400).json({ msg: 'Please provide business name and category' });
        }

        // Sanitise sentinel values ('manual', 'null', etc.) and resolve
        // any "Add Manually..." location entries to real DB records.
        await resolveManualLocation(payload);

        const sanitizedOwner = payload.owner && payload.owner !== 'null' ? payload.owner : null;

        const newListing = new Company({
            ...payload,
            status: status || 'Active',
            approvalStatus: {
                stage: 'Approved',
                reviewedBy: req.user?._id,
                reviewedAt: new Date()
            },
            owner: sanitizedOwner,
            claimed: !!sanitizedOwner
        });

        await newListing.save();

        // Log action
        await AdminAuditLog.create({
            adminId: req.user?._id,
            action: 'LISTING_CREATED',
            targetType: 'Listing',
            targetId: newListing._id,
            notes: `Admin created listing: ${name}`,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        });

        res.status(201).json(newListing);
    } catch (err) {
        console.error('Create Listing Admin Error:', err);
        if (err.name === 'ValidationError') {
            const fieldErrors = Object.entries(err.errors || {}).map(
                ([field, e]) => `${field}: ${e.message}`
            );
            return res.status(400).json({
                msg: 'Validation failed',
                errors: fieldErrors
            });
        }
        if (err.code === 11000) {
            return res.status(409).json({ msg: 'Listing already exists with the same slug or unique field' });
        }
        res.status(500).json({ msg: 'Server error creating listing', error: err.message });
    }
};

// @desc    Update listing by admin
// @route   PUT /api/admin/listings/:id
exports.updateListingAdmin = async (req, res) => {
    try {
        const { id } = req.params;
        let query = {};
        
        if (id.match(/^[0-9a-fA-F]{24}$/)) {
            query = { _id: id };
        } else {
            query = { slug: id };
        }

        const listing = await Company.findOne(query);
        if (!listing) {
            return res.status(404).json({ success: false, msg: 'Listing not found' });
        }

        // Sanitise sentinel values and resolve any "Add Manually..." location
        // entries to real DB records, matching createListingAdmin.
        await resolveManualLocation(req.body);

        // Update fields directly from req.body
        const updateFields = req.body;

        // Snapshot tracked fields before mutation so we can log a field-level
        // change history, matching the merchant-facing companyController.updateCompany.
        const TRACKED_FIELDS = ['name', 'status', 'category', 'category_id', 'owner', 'manualRank', 'city_id', 'area_id', 'phone', 'email', 'address'];
        const beforeSnapshot = {};
        TRACKED_FIELDS.forEach(f => { beforeSnapshot[f] = listing[f]; });

        // ObjectId fields that must be null instead of empty string
        const objectIdFields = ['owner', 'category_id', 'country_id', 'state_id', 'city_id', 'area_id', 'plan'];

        for (const key of Object.keys(updateFields)) {
            if (updateFields[key] === undefined) continue;

            if (objectIdFields.includes(key)) {
                // Convert empty strings / sentinels to null for ObjectId fields
                if (!updateFields[key] || updateFields[key] === '' || updateFields[key] === 'null' || updateFields[key] === 'manual' || updateFields[key] === 'undefined') {
                    listing[key] = null;
                } else if (mongoose.Types.ObjectId.isValid(updateFields[key])) {
                    listing[key] = updateFields[key];
                } else {
                    return res.status(400).json({
                        success: false,
                        msg: `Invalid value for "${key}" — expected a valid id`
                    });
                }
            } else {
                listing[key] = updateFields[key];
            }
        }

        TRACKED_FIELDS.forEach(field => {
            if (updateFields[field] !== undefined && String(listing[field]) !== String(beforeSnapshot[field])) {
                listing.changeHistory.push({
                    field,
                    oldValue: beforeSnapshot[field],
                    newValue: listing[field],
                    changedBy: req.user._id
                });
            }
        });

        await listing.save();

        // Log audit
        await AdminAuditLog.create({
            adminId: req.user?._id,
            action: 'LISTING_EDITED',
            targetType: 'Listing',
            targetId: listing._id,
            notes: 'Admin updated listing details',
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        });

        res.json({ success: true, msg: 'Listing updated successfully', listing });
    } catch (err) {
        console.error('Update Listing Admin Error:', err);
        if (err.name === 'ValidationError') {
            const fieldErrors = Object.entries(err.errors || {}).map(
                ([field, e]) => `${field}: ${e.message}`
            );
            return res.status(400).json({ success: false, msg: 'Validation failed', errors: fieldErrors });
        }
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// @desc    Import listings from array of listings (CSV data parsed on client or sent directly)
// @route   POST /api/admin/listings/import
exports.importListings = async (req, res) => {
    try {
        const { listings } = req.body;
        if (!listings || !Array.isArray(listings) || listings.length === 0) {
            return res.status(400).json({ success: false, msg: 'No listings provided for import' });
        }

        const Category = require('../models/Category');
        const City = require('../models/City');
        const Plan = require('../models/Plan');
        const User = require('../models/User');

        // Pre-fetch all categories, cities, plans, users to avoid database query per listing
        const categories = await Category.find({});
        const cities = await City.find({});
        const plans = await Plan.find({});
        const users = await User.find({});

        const results = {
            successCount: 0,
            updatedCount: 0,
            failedCount: 0,
            errors: []
        };

        for (let i = 0; i < listings.length; i++) {
            const data = listings[i];
            
            try {
                if (!data.name) {
                    throw new Error('Business name is required');
                }
                if (!data.category) {
                    throw new Error('Category is required');
                }

                // Resolve Category with smart matching & auto-creation
                let category_id = null;
                let categoryText = data.category.trim();

                // 1. Exact match (case insensitive)
                let matchedCategory = categories.find(c => 
                    c.name.toLowerCase() === categoryText.toLowerCase()
                );

                // 2. Substring match (e.g. database has "IT Services", input is "IT Services Group")
                //    Guarded to >=4 chars, matching the owner-name substring match below —
                //    a short value like "IT" would otherwise match any category merely
                //    containing those letters (e.g. "Hospitality").
                if (!matchedCategory && categoryText.length >= 4) {
                    matchedCategory = categories.find(c =>
                        c.name.toLowerCase().includes(categoryText.toLowerCase())
                    );
                }

                if (matchedCategory) {
                    category_id = matchedCategory._id;
                    categoryText = matchedCategory.name; // Use canonical name
                } else {
                    // Create Category automatically!
                    const slugify = require('slugify');
                    const baseSlug = slugify(categoryText, { lower: true, strict: true });
                    let generatedSlug = baseSlug || 'category';
                    let suffix = 1;
                    
                    // Ensure slug uniqueness
                    while (categories.some(c => c.slug === generatedSlug)) {
                        generatedSlug = `${baseSlug}-${suffix++}`;
                    }

                    const newCategory = new Category({
                        name: categoryText,
                        slug: generatedSlug,
                        status: 'Active'
                    });
                    
                    await newCategory.save();
                    
                    // Add it to our cached array so it won't be re-created for subsequent rows
                    categories.push(newCategory);
                    
                    category_id = newCategory._id;
                }

                // Resolve Assigned Owner with smart matching & auto-creation
                let owner_id = null;
                let ownerText = data.owner ? data.owner.trim() : '';

                if (ownerText) {
                    // 1. Exact match (case insensitive name or email)
                    let matchedUser = users.find(u => 
                        (u.email && u.email.toLowerCase() === ownerText.toLowerCase()) ||
                        (u.name && u.name.toLowerCase() === ownerText.toLowerCase())
                    );

                    // 2. Safe substring match (database user's name contains full input name, minimum 4 chars)
                    if (!matchedUser && ownerText.length >= 4) {
                        matchedUser = users.find(u => 
                            u.name && u.name.toLowerCase().includes(ownerText.toLowerCase())
                        );
                    }

                    if (matchedUser) {
                        owner_id = matchedUser._id;
                        // Update mobileNumber if not set and present in CSV
                        if (data.phone && data.phone.trim() !== '' && (!matchedUser.mobileNumber || matchedUser.mobileNumber.trim() === '')) {
                            matchedUser.mobileNumber = data.phone.trim();
                            await matchedUser.save();
                        }
                    } else {
                        // Create User automatically!
                        const bcrypt = require('bcryptjs');
                        const slugify = require('slugify');
                        
                        // Generate a dummy unique email
                        const safeName = slugify(ownerText, { lower: true, strict: true }) || 'user';
                        let generatedEmail = `${safeName}@example.com`;
                        let suffix = 1;
                        while (users.some(u => u.email === generatedEmail)) {
                            generatedEmail = `${safeName}${suffix++}@example.com`;
                        }

                        // Generate simple password (exactly 123456789)
                        const simplePassword = '123456789';
                        const salt = await bcrypt.genSalt(10);
                        const hashedPassword = await bcrypt.hash(simplePassword, salt);

                        const userFields = {
                            name: ownerText,
                            email: generatedEmail,
                            password: hashedPassword,
                            role: 'Merchant', // Default role for listing owners
                            status: 'Active',
                            isEmailVerified: true
                        };

                        if (data.phone && data.phone.trim() !== '') {
                            userFields.mobileNumber = data.phone.trim();
                        }

                        const newUser = new User(userFields);
                        await newUser.save();
                        
                        // Push an info message to results.errors detailing the new user account and password
                        results.errors.push({
                            row: i + 1,
                            name: data.name.trim(),
                            error: `Account created for merchant "${ownerText}" with simple password: "${simplePassword}" (Email: ${generatedEmail}).`
                        });
                        
                        // Add to our cached list of users so we don't recreate on duplicate name rows
                        users.push(newUser);
                        
                        owner_id = newUser._id;
                    }
                }

                // Resolve City
                let city_id = null;
                let state_id = null;
                if (data.city) {
                    const matchedCity = cities.find(c => 
                        c.name.toLowerCase() === data.city.trim().toLowerCase()
                    );
                    if (matchedCity) {
                        city_id = matchedCity._id;
                        state_id = matchedCity.state_id;
                    }
                }

                // Resolve Plan
                let plan_id = null;
                if (data.plan) {
                    const matchedPlan = plans.find(p => 
                        p.name.toLowerCase() === data.plan.trim().toLowerCase()
                    );
                    if (matchedPlan) {
                        plan_id = matchedPlan._id;
                    }
                }

                const companyData = {
                    name: data.name.trim(),
                    category: categoryText,
                    category_id,
                    city_id,
                    state_id,
                    address: data.address ? data.address.trim() : '',
                    description: data.description ? data.description.trim() : '',
                    phone: data.phone ? data.phone.trim() : '',
                    email: data.email ? data.email.trim() : '',
                    website: data.website ? data.website.trim() : '',
                    plan: plan_id,
                    status: data.status ? data.status.trim() : 'Active',
                    approvalStatus: {
                        stage: 'Approved',
                        reviewedBy: req.user?._id,
                        reviewedAt: new Date()
                    },
                    owner: owner_id,
                    claimed: !!owner_id
                };

                // Duplicate guard: same business name in the same city is treated as the
                // same listing, matching bulkImportController's find-or-update pattern —
                // without this, re-running an import file creates full duplicates.
                const duplicate = await Company.findOne({
                    name: new RegExp(`^${escapeRegex(companyData.name)}$`, 'i'),
                    ...(city_id ? { city_id } : {})
                });

                if (duplicate) {
                    Object.assign(duplicate, companyData);
                    await duplicate.save();
                    results.updatedCount++;
                } else {
                    const newCompany = new Company(companyData);
                    await newCompany.save();
                    results.successCount++;
                }
            } catch (err) {
                results.failedCount++;
                results.errors.push({
                    row: i + 1,
                    name: data.name || 'Unknown',
                    error: err.message
                });
            }
        }

        // Log audit
        await AdminAuditLog.create({
            adminId: req.user?._id,
            action: 'BULK_ACTION_EXECUTED',
            targetType: 'Listing',
            notes: `Imported ${results.successCount} listings, updated ${results.updatedCount}, ${results.failedCount} failed`,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        });

        res.json({
            success: true,
            msg: `Import completed: ${results.successCount} created, ${results.updatedCount} updated, ${results.failedCount} failed`,
            ...results
        });
    } catch (err) {
        console.error('Import Listings Error:', err);
        res.status(500).json({ success: false, msg: 'Server Error during import', error: err.message });
    }
};

// ==================== PHOTO MODERATION ====================

// @desc    Get pending photos across all listings (moderation queue)
// @route   GET /api/admin/photos/pending
// @desc    Get groups of companies with pending photos
// @route   GET /api/admin/photos/pending-groups
exports.getPendingPhotoGroups = async (req, res) => {
    try {
        const pipeline = [
            { $match: { 'images.status': 'Pending' } },
            { $unwind: '$images' },
            { $match: { 'images.status': 'Pending' } },
            { 
                $group: {
                    _id: '$_id',
                    name: { $first: '$name' },
                    slug: { $first: '$slug' },
                    pendingCount: { $sum: 1 }
                }
            },
            { $sort: { pendingCount: -1 } }
        ];
        
        const groups = await Company.aggregate(pipeline);
        
        res.json({
            success: true,
            data: groups,
            totalGroups: groups.length
        });
    } catch (err) {
        console.error('Get Pending Photo Groups Error:', err);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// @desc    Get pending photos across all listings or for a specific listing
// @route   GET /api/admin/photos/pending
exports.getPendingPhotos = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 24;
        const skip = (page - 1) * limit;
        const listingId = req.query.listingId;

        const matchStage = listingId 
            ? { 'images.status': 'Pending', _id: new mongoose.Types.ObjectId(listingId) }
            : { 'images.status': 'Pending' };

        // Count total pending photos
        const countPipeline = [
            { $match: matchStage },
            { $unwind: '$images' },
            { $match: { 'images.status': 'Pending' } },
            { $count: 'total' }
        ];
        const countResult = await Company.aggregate(countPipeline);
        const total = countResult[0]?.total || 0;

        // Fetch pending photos with pagination
        const photos = await Company.aggregate([
            { $match: matchStage },
            { $unwind: '$images' },
            { $match: { 'images.status': 'Pending' } },
            { $sort: { 'images._id': -1 } },
            { $skip: skip },
            { $limit: limit },
            {
                $project: {
                    listingId: '$_id',
                    listingName: '$name',
                    listingSlug: '$slug',
                    photoId: '$images._id',
                    url: '$images.url',
                    order: '$images.order',
                    status: '$images.status'
                }
            }
        ]);

        res.json({
            success: true,
            data: photos,
            pagination: {
                total,
                page,
                limit,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (err) {
        console.error('Get Pending Photos Error:', err);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// @desc    Update photo status (approve/reject)
// @route   PUT /api/admin/listings/:id/photos/:photoId
exports.updatePhotoStatus = async (req, res) => {
    try {
        const { id, photoId } = req.params;
        const { status } = req.body;

        const VALID_STATUSES = ['Approved', 'Rejected'];
        if (!status || !VALID_STATUSES.includes(status)) {
            return res.status(400).json({
                success: false,
                msg: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`
            });
        }

        const listing = await Company.findById(id);
        if (!listing) {
            return res.status(404).json({ success: false, msg: 'Listing not found' });
        }

        const photo = listing.images.id(photoId);
        if (!photo) {
            return res.status(404).json({ success: false, msg: 'Photo not found in this listing' });
        }

        const oldStatus = photo.status;
        photo.status = status;

        // Cover-photo logic
        if (status === 'Approved') {
            // If no approved cover exists yet, make this the cover
            const hasApprovedCover = listing.images.some(
                img => img.isCover && img.status === 'Approved' && img._id.toString() !== photoId
            );
            if (!hasApprovedCover) {
                // Clear any existing cover flags first
                listing.images.forEach(img => { img.isCover = false; });
                photo.isCover = true;
            }
        } else if (status === 'Rejected' && photo.isCover) {
            // Rejecting the cover — promote the next approved photo by order
            photo.isCover = false;
            const nextCover = listing.images
                .filter(img => img.status === 'Approved' && img._id.toString() !== photoId)
                .sort((a, b) => (a.order || 0) - (b.order || 0))[0];
            if (nextCover) nextCover.isCover = true;
        }

        await listing.save();

        // Log audit
        await AdminAuditLog.create({
            adminId: req.user?._id,
            action: status === 'Approved' ? 'PHOTO_APPROVED' : 'PHOTO_REJECTED',
            targetType: 'Listing',
            targetId: listing._id,
            changes: {
                before: { photoId, status: oldStatus },
                after: { photoId, status, url: photo.url }
            },
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        });

        res.json({
            success: true,
            msg: `Photo ${status.toLowerCase()} successfully`,
            photo: { _id: photo._id, url: photo.url, status: photo.status, isCover: photo.isCover }
        });
    } catch (err) {
        console.error('Update Photo Status Error:', err);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// @desc    Bulk approve/reject photos
// @route   POST /api/admin/photos/bulk-action
exports.bulkPhotoAction = async (req, res) => {
    try {
        const { items, action } = req.body;

        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ success: false, msg: 'No photo items provided' });
        }

        const VALID_ACTIONS = ['approve', 'reject'];
        if (!VALID_ACTIONS.includes(action)) {
            return res.status(400).json({ success: false, msg: 'Invalid action. Must be "approve" or "reject"' });
        }

        const targetStatus = action === 'approve' ? 'Approved' : 'Rejected';
        let successCount = 0;
        let failedCount = 0;

        // Group by listingId to minimise DB reads
        const groupedByListing = {};
        for (const item of items) {
            if (!groupedByListing[item.listingId]) {
                groupedByListing[item.listingId] = [];
            }
            groupedByListing[item.listingId].push(item.photoId);
        }

        for (const [listingId, photoIds] of Object.entries(groupedByListing)) {
            try {
                const listing = await Company.findById(listingId);
                if (!listing) {
                    failedCount += photoIds.length;
                    continue;
                }

                for (const photoId of photoIds) {
                    const photo = listing.images.id(photoId);
                    if (!photo) {
                        failedCount++;
                        continue;
                    }

                    photo.status = targetStatus;

                    // Cover-photo logic (same as single update)
                    if (targetStatus === 'Approved') {
                        const hasApprovedCover = listing.images.some(
                            img => img.isCover && img.status === 'Approved' && img._id.toString() !== photoId
                        );
                        if (!hasApprovedCover) {
                            listing.images.forEach(img => { img.isCover = false; });
                            photo.isCover = true;
                        }
                    } else if (targetStatus === 'Rejected' && photo.isCover) {
                        photo.isCover = false;
                        const nextCover = listing.images
                            .filter(img => img.status === 'Approved' && img._id.toString() !== photoId)
                            .sort((a, b) => (a.order || 0) - (b.order || 0))[0];
                        if (nextCover) nextCover.isCover = true;
                    }

                    successCount++;
                }

                await listing.save();
            } catch (listingErr) {
                console.error(`Bulk photo action error for listing ${listingId}:`, listingErr);
                failedCount += photoIds.length;
            }
        }

        // Log audit
        await AdminAuditLog.create({
            adminId: req.user?._id,
            action: action === 'approve' ? 'PHOTO_BULK_APPROVED' : 'PHOTO_BULK_REJECTED',
            targetType: 'Listing',
            notes: `Bulk ${action}: ${successCount} succeeded, ${failedCount} failed`,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        });

        res.json({
            success: true,
            msg: `Bulk ${action} completed: ${successCount} succeeded, ${failedCount} failed`,
            successCount,
            failedCount
        });
    } catch (err) {
        console.error('Bulk Photo Action Error:', err);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};
