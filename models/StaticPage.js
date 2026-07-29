const mongoose = require('mongoose');

const staticPageSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    slug: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    content: {
        type: String,
        required: true
    },
    pageType: {
        type: String,
        required: true,
        enum: ['about', 'contact', 'privacy', 'terms', 'faq', 'help', 'custom']
    },
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
    seoTitle: String,
    seoDescription: String,
    seoKeywords: [String],
    viewCount: {
        type: Number,
        default: 0
    },
    isInFooter: {
        type: Boolean,
        default: false
    },
    footerOrder: {
        type: Number,
        default: 0
    },
    isInHeader: {
        type: Boolean,
        default: false
    },
    headerOrder: {
        type: Number,
        default: 0
    },
    customUrl: String, // For custom pages
    meta: {
        robots: {
            type: String,
            default: 'index,follow'
        },
        canonical: String
    }
}, { timestamps: true });

// Indexes
staticPageSchema.index({ status: 1, publishedAt: -1 });
staticPageSchema.index({ pageType: 1, status: 1 });

// Pre-save middleware to generate slug
staticPageSchema.pre('save', function(next) {
    if (this.isModified('title') && !this.slug) {
        this.slug = this.title
            .toLowerCase()
            .replace(/[^a-zA-Z0-9\s]/g, '')
            .replace(/\s+/g, '-')
            .substring(0, 100);
    }
    next();
});

module.exports = mongoose.model('StaticPage', staticPageSchema);