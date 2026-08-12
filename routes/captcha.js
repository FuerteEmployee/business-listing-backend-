const express = require('express');
const router = express.Router();
const { getCaptcha } = require('../controllers/captchaController');

// @route   GET /api/captcha
router.get('/', getCaptcha);

module.exports = router;
