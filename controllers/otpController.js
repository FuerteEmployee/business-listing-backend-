const User = require('../models/User');
const OTP = require('../models/OTP');
const { sendSMS, sendWhatsApp } = require('../utils/sms');

// @desc    Send OTP to mobile
// @route   POST /api/otp/send
// @access  Public
const jwt = require('jsonwebtoken');

// Helper to generate token (DRY: could be moved to a util)
const generateToken = (id, role, name, email, tokenVersion = 0) => {
    return jwt.sign({ id, role, name, email, tokenVersion }, process.env.JWT_SECRET || 'fallback_secret', {
        expiresIn: '30d',
    });
};

// @desc    Send OTP to mobile
// @route   POST /api/otp/send
// @access  Public
exports.sendOTP = async (req, res) => {
    try {
        const { mobileNumber, channel = 'SMS' } = req.body; // channel: SMS or WhatsApp

        if (!mobileNumber) {
            return res.status(400).json({ msg: 'Please provide a mobile number' });
        }

        // Check for rate limiting (max 5 attempts per hour)
        const existingOTP = await OTP.findOne({ phone: mobileNumber });
        if (existingOTP && existingOTP.attempts >= 5) {
            const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
            if (existingOTP.lastAttempt > oneHourAgo) {
                return res.status(429).json({ msg: 'Too many OTP attempts. Please try again after an hour.' });
            } else {
                // Reset if an hour has passed
                existingOTP.attempts = 0;
            }
        }

        // Generate 6-digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();

        // Save/Update to DB
        await OTP.findOneAndUpdate(
            { phone: mobileNumber },
            { 
                otp, 
                $inc: { attempts: 1 }, 
                lastAttempt: Date.now(),
                createdAt: Date.now() // Refresh TTL
            },
            { upsert: true, new: true }
        );

        // SMS / WhatsApp dispatch
        const message = `Your Fuerte verification code is: ${otp}. Valid for 10 minutes.`;

        if (channel === 'WhatsApp') {
            await sendWhatsApp(mobileNumber, message);
        } else {
            await sendSMS(mobileNumber, message);
        }

        res.json({ success: true, msg: 'OTP sent successfully' });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
};

// @desc    Verify OTP
// @route   POST /api/otp/verify
// @access  Public
exports.verifyOTP = async (req, res) => {
    try {
        const { mobileNumber, otp } = req.body;

        if (!mobileNumber || !otp) {
            return res.status(400).json({ msg: 'Please provide mobile number and OTP' });
        }

        const otpRecord = await OTP.findOne({ phone: mobileNumber });

        // Check for dev bypass or real match
        const isBypass = otp === '123456';
        
        if (!isBypass && (!otpRecord || otpRecord.otp !== otp)) {
            return res.status(400).json({ msg: 'Invalid or expired OTP' });
        }

        // Mark user as OTP verified if they exist
        const user = await User.findOneAndUpdate({ mobileNumber }, { otpVerified: true }, { new: true });

        // Delete OTP record after successful verification
        if (otpRecord) {
            await OTP.deleteOne({ _id: otpRecord._id });
        }

        // If user already exists, this is an "OTP Login"
        let response = { success: true, msg: 'OTP verified successfully' };
        
        if (user) {
            const token = generateToken(user._id, user.role, user.name, user.email, user.tokenVersion);
            response.token = token;
            response.user = {
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role
            };
        }

        res.json(response);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
};
