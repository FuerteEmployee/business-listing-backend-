const mongoose = require('mongoose');

const broadcastSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    templateId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'BroadcastTemplate',
        required: true
    },
    channel: {
        type: String,
        required: true,
        enum: ['Push', 'SMS', 'Email', 'WhatsApp']
    },
    // Target Segments
    targetType: {
        type: String,
        required: true,
        enum: ['All', 'Segment', 'Manual'],
        default: 'All'
    },
    segmentFilters: {
        role: String,
        city: String,
        lastLoginAfter: Date,
        isActive: Boolean
    },
    manualTargets: [String], // Emails or Phone numbers
    
    // Scheduling
    status: {
        type: String,
        enum: ['Draft', 'Scheduled', 'Processing', 'Completed', 'Failed', 'Cancelled'],
        default: 'Draft'
    },
    scheduledAt: {
        type: Date,
        default: Date.now
    },
    startedAt: Date,
    completedAt: Date,

    // Statistics
    stats: {
        totalTargeted: { type: Number, default: 0 },
        sent: { type: Number, default: 0 },
        failed: { type: Number, default: 0 },
        opened: { type: Number, default: 0 }, // For email tracking
        clicked: { type: Number, default: 0 }
    },

    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    errorLog: String
}, { timestamps: true });

module.exports = mongoose.model('Broadcast', broadcastSchema);
