const mongoose = require('mongoose');

const responseTemplateSchema = new mongoose.Schema({
    businessId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company',
        required: true
    },
    title: {
        type: String,
        required: true,
        trim: true
    },
    content: {
        type: String,
        required: true
    },
    category: {
        type: String,
        enum: ['Lead Reply', 'Review Reply', 'Support'],
        default: 'Lead Reply'
    },
    // Usage counter
    usageCount: {
        type: Number,
        default: 0
    }
}, { timestamps: true });

// Index for template searches
responseTemplateSchema.index({ businessId: 1, category: 1 });

module.exports = mongoose.model('ResponseTemplate', responseTemplateSchema);
