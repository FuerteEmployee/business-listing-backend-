const mongoose = require('mongoose');

const blacklistSchema = new mongoose.Schema({
    type: {
        type: String,
        required: true,
        enum: ['ip', 'phone', 'email', 'domain']
    },
    value: {
        type: String,
        required: true,
        lowercase: true,
        trim: true
    },
    reason: {
        type: String,
        required: true
    },
    severity: {
        type: String,
        enum: ['low', 'medium', 'high', 'critical'],
        default: 'medium'
    },
    addedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    expiresAt: {
        type: Date,
        default: null // null means permanent
    },
    isActive: {
        type: Boolean,
        default: true
    },
    hitCount: {
        type: Number,
        default: 0
    },
    lastHit: Date,
    notes: String,
    source: {
        type: String,
        enum: ['manual', 'auto', 'import'],
        default: 'manual'
    }
}, { timestamps: true });

// Compound index for efficient lookups
blacklistSchema.index({ type: 1, value: 1 }, { unique: true });
blacklistSchema.index({ isActive: 1, expiresAt: 1 });
blacklistSchema.index({ type: 1, isActive: 1 });

// Pre-save middleware to check expiration
blacklistSchema.pre('save', function(next) {
    if (this.expiresAt && this.expiresAt < new Date()) {
        this.isActive = false;
    }
    next();
});

// Static method to check if value is blacklisted
blacklistSchema.statics.isBlacklisted = async function(type, value) {
    const entry = await this.findOne({
        type,
        value: value.toLowerCase().trim(),
        isActive: true,
        $or: [
            { expiresAt: null },
            { expiresAt: { $gt: new Date() } }
        ]
    });

    if (entry) {
        // Increment hit count
        await this.findByIdAndUpdate(entry._id, {
            $inc: { hitCount: 1 },
            lastHit: new Date()
        });
        return true;
    }

    return false;
};

module.exports = mongoose.model('Blacklist', blacklistSchema);