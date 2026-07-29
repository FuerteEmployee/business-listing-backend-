const mongoose = require('mongoose');

const adSlotSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    page: {
        type: String,
        enum: ['home', 'search', 'business_detail', 'category', 'all'],
        required: true
    },
    position: {
        type: String,
        enum: ['top_banner', 'sidebar', 'inline', 'footer', 'popup', 'between_listings'],
        required: true
    },
    size: {
        width: { type: Number, required: true },
        height: { type: Number, required: true },
        label: { type: String, default: '' } // e.g. "728x90 Leaderboard"
    },
    pricingModel: {
        type: String,
        enum: ['cpm', 'cpc', 'flat'],
        default: 'cpm'
    },
    pricePerUnit: {
        type: Number,
        default: 0
    },
    maxAds: {
        type: Number,
        default: 1
    },
    isActive: {
        type: Boolean,
        default: true
    },
    description: {
        type: String,
        default: ''
    }
}, { timestamps: true });

module.exports = mongoose.model('AdSlot', adSlotSchema);
