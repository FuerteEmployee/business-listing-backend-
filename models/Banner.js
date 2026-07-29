const mongoose = require('mongoose');

const bannerSchema = new mongoose.Schema({
    title: {
        type: String,
        trim: true
    },
    subtitle: {
        type: String,
        trim: true
    },
    imageUrl: {
        type: String,
        required: true
    },
    link: {
        type: String,
        trim: true
    },
    buttonText: {
        type: String,
        default: 'Explore Now',
        trim: true
    },
    order: {
        type: Number,
        default: 0
    },
    status: {
        type: String,
        enum: ['active', 'inactive'],
        default: 'active'
    },
    type: {
        type: String,
        enum: ['homepage', 'category', 'sidebar'],
        default: 'homepage'
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, { timestamps: true });

module.exports = mongoose.model('Banner', bannerSchema);
