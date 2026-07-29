const express = require('express');
const { sendOTP, verifyOTP } = require('../controllers/otpController');

const router = express.Router();

router.post('/send', sendOTP);
router.post('/verify', verifyOTP);

module.exports = router;
