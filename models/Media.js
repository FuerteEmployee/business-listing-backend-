const mongoose = require('mongoose');

const mediaSchema = new mongoose.Schema({
    filename: {
        type: String,
        required: true
    },
    originalName: {
        type: String,
        required: true
    },
    mimeType: {
        type: String,
        required: true
    },
    size: {
        type: Number,
        required: true
    },
    url: {
        type: String,
        required: true // Cloudinary URL
    },
    publicId: {
        type: String,
        required: true // Cloudinary public ID
    },
    mediaType: {
        type: String,
        enum: ['image', 'video', 'document', 'audio'],
        required: true
    },
    category: {
        type: String,
        enum: ['article', 'profile', 'banner', 'logo', 'gallery', 'other'],
        default: 'other'
    },
    altText: String,
    caption: String,
    description: String,
    tags: [{
        type: String,
        trim: true
    }],
    uploadedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    dimensions: {
        width: Number,
        height: Number
    },
    metadata: {
        duration: Number, // for videos/audio
        format: String,
        quality: String,
        compression: String
    },
    isPublic: {
        type: Boolean,
        default: true
    },
    usageCount: {
        type: Number,
        default: 0
    },
    lastUsed: Date,
    folder: {
        type: String,
        default: 'general'
    }
}, { timestamps: true });

// Indexes for efficient queries
mediaSchema.index({ mediaType: 1, category: 1 });
mediaSchema.index({ uploadedBy: 1 });
mediaSchema.index({ tags: 1 });
mediaSchema.index({ folder: 1 });
mediaSchema.index({ createdAt: -1 });

// Virtual for file extension
mediaSchema.virtual('extension').get(function() {
    return this.filename.split('.').pop();
});

// Method to increment usage count
mediaSchema.methods.incrementUsage = function() {
    this.usageCount += 1;
    this.lastUsed = new Date();
    return this.save();
};

module.exports = mongoose.model('Media', mediaSchema);