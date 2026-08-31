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
// Slugs are scoped to the state, not global: the same city name legitimately recurs
// across states, and no lookup resolves a city by slug alone.
citySchema.index({ state_id: 1, slug: 1 }, { unique: true });

// --- Read-path indexes -----------------------------------------------------
// The collection holds ~7.9k cities, so every list endpoint filters and paginates.
// These three cover the exact filter+sort shapes locationController issues, letting
// Mongo satisfy them from an index instead of sorting the whole collection in memory.

// GET /locations/cities?state_id=... - the City dropdown. Matches the
// `{ state_id, status }` filter and the `isPopular desc, order, name` sort.
citySchema.index({ state_id: 1, status: 1, isPopular: -1, order: 1, name: 1 });

// GET /locations/cities with no state_id - the public homepage/search pickers,
// same sort but filtered on status alone.
citySchema.index({ status: 1, isPopular: -1, order: 1, name: 1 });

// Name search on both the public dropdowns and the admin Cities table. A
// case-insensitive regex cannot range-scan unless it is anchored, but this still
// keeps the match an index scan over ~7.9k keys rather than a full document scan.
citySchema.index({ name: 1 });

module.exports = mongoose.model('City', citySchema);
