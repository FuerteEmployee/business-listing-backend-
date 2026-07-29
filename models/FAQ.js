const mongoose = require('mongoose');

const faqSchema = new mongoose.Schema({
    question: {
        type: String,
        required: true,
        trim: true
    },
    answer: {
        type: String,
        required: true
    },
    category: {
        type: String,
        required: true,
        enum: ['general', 'business', 'user', 'technical', 'billing', 'legal']
    },
    tags: [{
        type: String,
        trim: true
    }],
    status: {
        type: String,
        enum: ['draft', 'published', 'archived'],
        default: 'draft'
    },
    author: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    publishedAt: {
        type: Date,
        default: null
    },
    order: {
        type: Number,
        default: 0
    },
    isFeatured: {
        type: Boolean,
        default: false
    },
    viewCount: {
        type: Number,
        default: 0
    },
    helpfulCount: {
        type: Number,
        default: 0
    },
    notHelpfulCount: {
        type: Number,
        default: 0
    },
    seoQuestion: String, // For structured data
    seoAnswer: String,
    relatedFAQs: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'FAQ'
    }]
}, { timestamps: true });

// Indexes
faqSchema.index({ status: 1, category: 1 });
faqSchema.index({ category: 1, order: 1 });
faqSchema.index({ tags: 1 });
faqSchema.index({ question: 'text', answer: 'text' }); // Full-text search

// Method to calculate helpfulness ratio
faqSchema.methods.getHelpfulnessRatio = function() {
    const total = this.helpfulCount + this.notHelpfulCount;
    return total > 0 ? (this.helpfulCount / total) * 100 : 0;
};

// Static method to get FAQs by category
faqSchema.statics.getPublishedByCategory = function(category) {
    return this.find({
        category,
        status: 'published'
    }).sort({ order: 1, createdAt: -1 });
};

module.exports = mongoose.model('FAQ', faqSchema);