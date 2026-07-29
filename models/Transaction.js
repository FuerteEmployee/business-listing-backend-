const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
    businessId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company',
        required: true
    },
    subscriptionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Subscription'
    },
    amount: {
        type: Number,
        required: true
    },
    currency: {
        type: String,
        default: 'INR'
    },
    status: {
        type: String,
        enum: ['pending', 'success', 'failed', 'refunded'],
        default: 'pending'
    },
    gateway: {
        type: String,
        enum: ['razorpay', 'stripe', 'manual'],
        required: true
    },
    gatewayPaymentId: String,
    gatewayOrderId: String,
    gatewaySignature: String,
    metadata: mongoose.Schema.Types.Mixed,
}, { timestamps: true });

module.exports = mongoose.model('Transaction', transactionSchema);
