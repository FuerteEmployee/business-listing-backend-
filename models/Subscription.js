const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
    businessId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company',
        required: true
    },
    planId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Plan',
        required: true
    },
    status: {
        type: String,
        enum: ['active', 'expired', 'grace_period', 'cancelled'],
        default: 'active'
    },
    billingCycle: {
        type: String,
        enum: ['monthly', 'annual'],
        required: true
    },
    startDate: {
        type: Date,
        default: Date.now
    },
    endDate: {
        type: Date,
        required: true
    },
    autoRenew: {
        type: Boolean,
        default: true
    },
    nextBillingDate: Date,
    priceAtPurchase: Number,
    lastTransactionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Transaction'
    }
}, { timestamps: true });

module.exports = mongoose.model('Subscription', subscriptionSchema);
