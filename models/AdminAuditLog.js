const mongoose = require('mongoose');

const adminAuditLogSchema = new mongoose.Schema({
    adminId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    action: {
        type: String,
        required: true,
        enum: [
            'USER_CREATED',
            'USER_UPDATED',
            'USER_BANNED',
            'USER_UNBANNED',
            'USER_VERIFIED',
            'USER_UNVERIFIED',
            'USER_PASSWORD_RESET',
            'USER_IMPERSONATED',
            'USER_DELETED',
            'USER_ANONYMIZED',
            'USER_ACCOUNTS_MERGED',
            'LISTING_APPROVED',
            'LISTING_REJECTED',
            'LISTING_FLAGGED',
            'LISTING_SUSPENDED',
            'LISTING_DELETED',
            'LISTING_BULK_APPROVED',
            'LISTING_BULK_REJECTED',
            'LISTING_BULK_DELETED',
            'LISTING_CREATED',
            'LISTING_CLAIMED',
            'LISTING_INFO_REQUESTED',
            'LISTING_EDITED',
            'LISTING_DUPLICATES_MERGED',
            'LISTING_EXPORTED',
            'REVIEW_APPROVED',
            'REVIEW_REJECTED',
            'REVIEW_SUSPENDED',
            'REVIEW_FLAGGED',
            'ROLE_CREATED',
            'ROLE_UPDATED',
            'ROLE_DELETED',
            'ADMIN_USER_CREATED',
            'ADMIN_USER_UPDATED',
            'ADMIN_USER_DEACTIVATED',
            'ADMIN_SESSION_FORCED_LOGOUT',
            'MESSAGE_SENT',
            'BULK_ACTION_EXECUTED',
            'PLAN_CREATED',
            'PLAN_UPDATED',
            'PLAN_ARCHIVED',
            'SUBSCRIPTION_ASSIGNED',
            'SUBSCRIPTION_UPDATED',
            'COUPON_CREATED',
            'COUPON_UPDATED',
            'COUPON_TOGGLED',
            'PHOTO_APPROVED',
            'PHOTO_REJECTED',
            'PHOTO_BULK_APPROVED',
            'PHOTO_BULK_REJECTED',
            'USER_LOGIN',
            'USER_LOGOUT'
        ]
    },
    // What was affected
    targetType: {
        type: String,
        enum: ['User', 'Listing', 'Review', 'Role', 'AdminUser', 'System', 'Plan', 'Subscription', 'Coupon', 'Refund', 'Invoice', 'Transaction', 'Payout', 'Broadcast']
    },
    targetId: mongoose.Schema.Types.ObjectId,
    // Changes detail
    changes: {
        before: {},
        after: {},
        fieldChanged: [String]
    },
    // Request details
    ipAddress: String,
    userAgent: String,
    // Notes
    notes: String,
    // Result
    status: {
        type: String,
        enum: ['Success', 'Failed'],
        default: 'Success'
    },
    error: String
}, { timestamps: true });

// Index for audit searches
adminAuditLogSchema.index({ adminId: 1, createdAt: -1 });
adminAuditLogSchema.index({ action: 1, createdAt: -1 });
adminAuditLogSchema.index({ targetType: 1, targetId: 1 });
adminAuditLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('AdminAuditLog', adminAuditLogSchema);
