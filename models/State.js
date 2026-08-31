const mongoose = require('mongoose');

const stateSchema = new mongoose.Schema({
    country_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Country',
        required: true
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    status: {
        type: String,
        enum: ['Active', 'Inactive'],
        default: 'Active'
    }
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

// Prevent duplicate states within the same country
stateSchema.index({ country_id: 1, name: 1 }, { unique: true });

// Read-path: GET /locations/states?country_id=... filters on { country_id, status }
// and sorts by name. The unique index above cannot serve it because `status` sits
// between the two keys the query uses.
stateSchema.index({ country_id: 1, status: 1, name: 1 });
// Name search on the admin States table, which is not scoped to one country.
stateSchema.index({ name: 1 });

module.exports = mongoose.model('State', stateSchema);
