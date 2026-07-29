const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
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
    questionText: {
        type: String,
        required: true,
        trim: true
    },
    answerText: {
        type: String,
        trim: true
    },
    isAnswered: {
        type: Boolean,
        default: false
    },
    answeredBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    answeredAt: Date
}, { timestamps: true });

// Index for fast lookups
questionSchema.index({ businessId: 1, createdAt: -1 });

module.exports = mongoose.model('Question', questionSchema);
