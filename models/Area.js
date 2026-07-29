const mongoose = require('mongoose');

const areaSchema = new mongoose.Schema({
    city_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'City',
        required: true
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    pincode: {
        type: String,
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
    meta: {
        title: { type: String, trim: true },
        description: { type: String, trim: true },
        keywords: { type: String, trim: true }
    }
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

// Prevent duplicate areas within the same city
areaSchema.index({ city_id: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Area', areaSchema);
