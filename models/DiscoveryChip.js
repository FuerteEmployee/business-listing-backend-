const mongoose = require('mongoose');

const DiscoveryChipSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    slug: {
        type: String,
        required: true,
        lowercase: true,
        trim: true
    },
    icon: {
        type: String,
        required: true,
        default: 'ShoppingCart'
    },
    color: {
        type: String,
        required: true,
        default: 'bg-indigo-50 text-indigo-600 border-indigo-100'
    },
    isActive: {
        type: Boolean,
        default: true
    },
    order: {
        type: Number,
        default: 0
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('DiscoveryChip', DiscoveryChipSchema);
