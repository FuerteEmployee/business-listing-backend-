const mongoose = require('mongoose');

const captchaSchema = new mongoose.Schema({
    text: {
        type: String,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now,
        // TTL index: MongoDB auto-deletes the document 5 minutes after creation, so an
        // unsolved/abandoned captcha never lingers as a stale valid answer.
        expires: 300
    }
});

module.exports = mongoose.model('Captcha', captchaSchema);
