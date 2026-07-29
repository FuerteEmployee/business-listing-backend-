const mongoose = require('mongoose');

const invoiceSchema = new mongoose.Schema({
    businessId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company',
        required: true
    },
    transactionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Transaction',
        required: true
    },
    invoiceNumber: {
        type: String,
        required: true,
        unique: true
    },
    date: {
        type: Date,
        default: Date.now
    },
    amount: {
        type: Number,
        required: true
    },
    taxAmount: {
        type: Number,
        default: 0
    },
    totalAmount: {
        type: Number,
        required: true
    },
    pdfUrl: String,
    status: {
        type: String,
        enum: ['paid', 'void', 'refunded'],
        default: 'paid'
    },
    billingDetails: {
        name: String,
        address: String,
        gstin: String
    }
}, { timestamps: true });

module.exports = mongoose.model('Invoice', invoiceSchema);
