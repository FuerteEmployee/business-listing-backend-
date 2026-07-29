const mongoose = require('mongoose');

const enquirySchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    businessIds: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Company',
            required: true
        }
    ],
    name: {
        type: String,
        required: true,
        trim: true
    },
    phone: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        trim: true,
        lowercase: true
    },
    message: {
        type: String,
        required: true,
        trim: true
    },
    // Track status per business
    status: {
        type: String,
        enum: ['Sent', 'Viewed', 'Responded', 'Resolved', 'Closed'],
        default: 'Sent'
    },
    // Source of enquiry
    source: {
        type: String,
        enum: ['Search', 'CategoryBrowse', 'Direct', 'Ad', 'Phone', 'Other', 'Business Detail', 'Search Results'],
        default: 'Search'
    },
    // Merchant responses
    responses: [
        {
            businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
            message: String,
            respondedAt: Date,
            respondedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
        }
    ],
    // IP address & rate limiting
    ipAddress: String,
    userAgent: String,
    // Soft delete
    isDeleted: {
        type: Boolean,
        default: false
    },
    deletedAt: Date,
    // Resolved by user
    resolvedBy: {
        type: String,
        enum: ['User', 'System'],
        default: null
    },
    resolvedAt: Date
}, { timestamps: true });

// Index for common queries
enquirySchema.index({ userId: 1, createdAt: -1 });
enquirySchema.index({ businessIds: 1, status: 1 });
enquirySchema.index({ createdAt: -1 });

module.exports = mongoose.model('Enquiry', enquirySchema);
