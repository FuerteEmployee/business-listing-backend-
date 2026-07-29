const mongoose = require('mongoose');

const fraudAlertSchema = new mongoose.Schema({
    type: {
        type: String,
        required: true,
        enum: ['listing', 'review', 'account', 'enquiry']
    },
    severity: {
        type: String,
        required: true,
        enum: ['low', 'medium', 'high', 'critical'],
        default: 'medium'
    },
    reason: {
        type: String,
        required: true
    },
    description: String,
    targetId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        refPath: 'targetModel'
    },
    targetModel: {
        type: String,
        required: true,
        enum: ['Company', 'Review', 'User', 'Enquiry']
    },
    status: {
        type: String,
        enum: ['pending', 'investigating', 'dismissed', 'confirmed'],
        default: 'pending'
    },
    assignedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    moderatorAction: {
        action: {
            type: String,
            enum: ['dismiss', 'suspend_listing', 'suspend_account', 'quarantine']
        },
        reason: String,
        moderatorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        timestamp: Date
    },
    metadata: {
        ipAddress: String,
        userAgent: String,
        duplicateCount: Number,
        velocityScore: Number,
        relatedIds: [mongoose.Schema.Types.ObjectId]
    },
    isResolved: {
        type: Boolean,
        default: false
    },
    resolvedAt: Date,
    notes: [{
        note: String,
        addedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        timestamp: {
            type: Date,
            default: Date.now
        }
    }]
}, { timestamps: true });

// Index for efficient queries
fraudAlertSchema.index({ type: 1, status: 1, severity: 1 });
fraudAlertSchema.index({ targetId: 1, targetModel: 1 });
fraudAlertSchema.index({ assignedTo: 1 });
fraudAlertSchema.index({ createdAt: -1 });

module.exports = mongoose.model('FraudAlert', fraudAlertSchema);