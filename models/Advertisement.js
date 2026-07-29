const mongoose = require('mongoose');

const advertisementSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    businessId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company'
    },
    slotId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AdSlot',
        required: true
    },
    campaignName: {
        type: String,
        default: ''
    },
    creativeUrl: {
        type: String,
        required: true  // image/banner URL
    },
    targetUrl: {
        type: String,
        default: ''
    },
    // Targeting
    targetLocations: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Location' // or City/Area depending on your system
    }],
    targetCategories: [{
        type: String
    }],
    // Schedule
    schedule: {
        startDate: { type: Date, required: true },
        endDate:   { type: Date, required: true }
    },
    // Status lifecycle
    status: {
        type: String,
        enum: ['draft', 'pending_review', 'approved', 'rejected', 'active', 'paused', 'expired'],
        default: 'draft'
    },
    // Pricing
    pricingModel: {
        type: String,
        enum: ['cpm', 'cpc', 'flat'],
        default: 'cpm'
    },
    bidAmount: {
        type: Number,
        default: 0
    },
    budget: {
        type: Number,
        default: 0
    },
    // Performance counters
    performance: {
        impressions: { type: Number, default: 0 },
        clicks:      { type: Number, default: 0 },
        spent:       { type: Number, default: 0 }
    },
    // Moderation
    moderationNote: {
        type: String,
        default: ''
    },
    approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, { timestamps: true });

// Virtuals
advertisementSchema.virtual('ctr').get(function() {
    if (!this.performance.impressions) return 0;
    return ((this.performance.clicks / this.performance.impressions) * 100).toFixed(2);
});

advertisementSchema.set('toJSON', { virtuals: true });
advertisementSchema.set('toObject', { virtuals: true });

// Indexes
advertisementSchema.index({ status: 1, 'schedule.startDate': 1, 'schedule.endDate': 1 });
advertisementSchema.index({ businessId: 1 });
advertisementSchema.index({ slotId: 1 });

module.exports = mongoose.model('Advertisement', advertisementSchema);
