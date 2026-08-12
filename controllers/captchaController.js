const Captcha = require('../models/Captcha');
const { generateCaptcha } = require('../utils/captcha');

// @desc    Get a new captcha challenge (SVG image + a server-side stored answer)
// @route   GET /api/captcha
// @access  Public
exports.getCaptcha = async (req, res) => {
    try {
        const { text, svg } = generateCaptcha();
        const record = await Captcha.create({ text });
        res.json({ captchaId: record._id, svg });
    } catch (err) {
        console.error('Captcha generation error:', err.message);
        res.status(500).json({ msg: 'Could not generate captcha' });
    }
};

/**
 * Verifies and consumes a captcha answer. Single-use: the record is deleted on this
 * call whether the answer is right or wrong, so a captcha can't be brute-forced by
 * repeated guesses against the same challenge - a wrong guess forces a fresh one.
 * Used internally by authController.register(), not exposed as its own route.
 */
exports.verifyAndConsumeCaptcha = async (captchaId, answer) => {
    if (!captchaId || !answer) return false;

    const record = await Captcha.findByIdAndDelete(captchaId).catch(() => null);
    if (!record) return false;

    return record.text.toUpperCase() === String(answer).trim().toUpperCase();
};
