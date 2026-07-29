const mongoose = require('mongoose');

const SystemConfigSchema = new mongoose.Schema({
    panel: {
        type: String,
        required: true,
        enum: ['admin', 'merchant', 'frontend'],
        unique: true
    },
    dbName: {
        type: String,
        required: true,
        default: 'justdial'
    },
    paginationLimit: {
        type: Number,
        default: 10
    },
    hiddenFeatures: {
        type: [String],
        default: []
    },
    isActive: {
        type: Boolean,
        default: true
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('SystemConfig', SystemConfigSchema);
