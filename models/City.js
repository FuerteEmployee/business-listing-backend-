const mongoose = require('mongoose');

const citySchema = new mongoose.Schema({
    state_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'State',
        required: true
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    slug: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true
    },
    status: {
        type: String,
        enum: ['Active', 'Inactive'],
        default: 'Active'
    },
    boundary: {
        type: {
            type: String,
            enum: ['Polygon'],
            default: 'Polygon'
        },
        coordinates: {
            type: [[[Number]]], // Array of arrays of arrays of numbers
            default: []
        }
    },
    isPopular: {
        type: Boolean,
        default: false
    },
    order: {
        type: Number,
        default: 0
    },
    meta: {
        title: { type: String, trim: true },
        description: { type: String, trim: true },
        keywords: { type: String, trim: true }
    }
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

// Prevent duplicate cities within the same state
citySchema.index({ state_id: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('City', citySchema);
