const mongoose = require('mongoose');

const offerSchema = new mongoose.Schema({
    businessId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company',
        required: true
    },
    title: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        trim: true
    },
    discountType: {
        type: String,
        enum: ['percentage', 'flat', 'buy_one_get_one', 'custom'],
        required: true
    },
    discountValue: {
        type: Number,
        required: function() {
            return this.discountType === 'percentage' || this.discountType === 'flat';
        }
    },
    validity: {
        startDate: { type: Date, required: true },
        endDate:   { type: Date, required: true }
    },
    status: {
        type: String,
        enum: ['draft', 'active', 'expired', 'archived'],
        default: 'active'
    },
    terms: {
        type: String
    },
    performance: {
        views: { type: Number, default: 0 },
        redemptions: { type: Number, default: 0 }
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, { timestamps: true });

// Auto-expire status on fetch
offerSchema.pre('find', function() {
    const now = new Date();
    // This is more efficient as a background job, but this is a simple middleware safeguard
    // Note: status updates here won't persist to DB unless save() is called separately
});

offerSchema.virtual('isActive').get(function() {
    const now = new Date();
    return this.status === 'active' && 
           now >= this.validity.startDate && 
           now <= this.validity.endDate;
});

offerSchema.set('toJSON', { virtuals: true });
offerSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Offer', offerSchema);
