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

module.exports = mongoose.model('State', stateSchema);
