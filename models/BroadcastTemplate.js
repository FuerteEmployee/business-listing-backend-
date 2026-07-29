const mongoose = require('mongoose');

const broadcastTemplateSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    description: String,
    channel: {
        type: String,
        required: true,
        enum: ['Push', 'SMS', 'Email', 'WhatsApp']
    },
    // For Email
    subject: {
        type: String,
        trim: true
    },
    // Main content
    body: {
        type: String,
        required: true
    },
    // For Push/WhatsApp (optional media)
    mediaUrl: String,
    // JSON metadata for dynamic fields
    variables: [String],
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, { timestamps: true });

module.exports = mongoose.model('BroadcastTemplate', broadcastTemplateSchema);
