const mongoose = require('mongoose');

const leadSchema = new mongoose.Schema({
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
    category: {
        type: String,
        trim: true
    },
    type: {
        type: String,
        enum: ['Budget', 'Luxury', 'Others', 'Requirement', 'Individual'],
        default: 'Others'
    },
    business: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company',
        default: null
    },
    status: {
        type: String,
        enum: ['New', 'Contacted', 'Interested', 'Quotation Sent', 'Converted', 'Closed', 'Lost'],
        default: 'New'
    },
    priority: {
        type: String,
        enum: ['Hot', 'Warm', 'Cold'],
        default: 'Warm'
    },
    notes: [
        {
            text: { type: String, required: true },
            date: { type: Date, default: Date.now },
            addedBy: { type: String }
        }
    ],
    followUpDate: {
        type: Date
    },
    source: {
        type: String,
        default: 'Web Result'
    },
    assignedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    assignedToName: {
        type: String,
        default: 'Unassigned'
    },
    assignmentHistory: [
        {
            assignedTo: { type: String },
            assignedBy: { type: String },
            date: { type: Date, default: Date.now }
        }
    ],
    firstContactAt: {
        type: Date
    },
    responseTime: {
        type: Number, // in minutes
        default: 0
    },
    agreedToPrivacy: {
        type: Boolean,
        default: false
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    merchantReply: {
        text: String,
        date: Date
    }
}, { timestamps: true });

module.exports = mongoose.model('Lead', leadSchema);
