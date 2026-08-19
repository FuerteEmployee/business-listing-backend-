const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
    businessId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company',
        required: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    rating: {
        type: Number,
        required: true,
        min: 1,
        max: 5
    },
    comment: {
        type: String,
        required: true,
        minlength: 20,
        trim: true
    },
    images: [{
        type: String // Cloudinary URL
    }],
    aspects: {
        quality: { type: Number, default: 0, min: 0, max: 5 },
        service: { type: Number, default: 0, min: 0, max: 5 },
        value: { type: Number, default: 0, min: 0, max: 5 }
    },
    // Voting system - track users who voted
    helpfulVotes: {
        count: { type: Number, default: 0 },
        voters: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
    },
    notHelpfulVotes: {
        count: { type: Number, default: 0 },
        voters: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
    },
    // Flag/Report system
    flags: [{
        flaggedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        reason: { type: String, enum: ['Fake', 'Spam', 'Offensive', 'Other'], required: true },
        description: String,
        flaggedAt: { type: Date, default: Date.now }
    }],
    // Owner reply
    ownerReply: {
        text: String,
        repliedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        date: Date,
        editedAt: Date
    },
    // Moderation
    status: {
        type: String,
        enum: ['Pending', 'Approved', 'Rejected', 'Suspended'],
        default: 'Pending' // Changed to Pending for moderation queue
    },
    moderationNotes: String,
    moderatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    moderatedAt: Date,
    // GDPR - soft delete support
    isDeleted: { type: Boolean, default: false },
    deletedAt: Date,
    // Editing
    isEdited: { type: Boolean, default: false },
    editedAt: Date,
    editHistory: [{
        oldComment: String,
        editedAt: Date
    }]
}, { timestamps: true });

// Index for common queries
reviewSchema.index({ businessId: 1, status: 1 });
reviewSchema.index({ userId: 1, businessId: 1 });
reviewSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Review', reviewSchema);
