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

// Read-path: GET /locations/areas?city_id=... filters on { city_id, status } and
// sorts by name; the unique index above stops short because of `status`.
areaSchema.index({ city_id: 1, status: 1, name: 1 });
// Name and pincode search on the admin Areas table, which is not scoped to one city.
areaSchema.index({ name: 1 });
areaSchema.index({ pincode: 1 });
// Slugs are scoped to the city, not global: names like "MG Road" or "Gandhi Nagar"
// recur in nearly every city, and no lookup resolves an area by slug alone.
areaSchema.index({ city_id: 1, slug: 1 }, { unique: true });

module.exports = mongoose.model('Area', areaSchema);
