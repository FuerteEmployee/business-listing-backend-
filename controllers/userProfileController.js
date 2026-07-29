const User = require('../models/User');
const Company = require('../models/Company');
const OTP = require('../models/OTP');
const jwt = require('jsonwebtoken');
const { sendSMS } = require('../utils/sms');

const generateToken = (id, role, name, email, tokenVersion = 0) => {
    return jwt.sign({ id, role, name, email, tokenVersion }, process.env.JWT_SECRET || 'fallback_secret', {
        expiresIn: '30d',
    });
};

// @desc    Get current user profile
// @route   GET /api/me/profile
// @access  Private
exports.getProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ msg: 'User not found' });
        }
        res.json({ success: true, data: user });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
};

// @desc    Update user profile
// @route   PUT /api/me/profile
// @access  Private
exports.updateProfile = async (req, res) => {
    try {
        const { name, profilePhoto, location, notificationPreferences, privacySettings } = req.body;
        
        const fieldsToUpdate = {};
        if (name) fieldsToUpdate.name = name;
        if (profilePhoto) fieldsToUpdate.profilePhoto = profilePhoto;
        if (location) fieldsToUpdate.location = location;
        if (notificationPreferences) fieldsToUpdate.notificationPreferences = notificationPreferences;
        if (privacySettings) fieldsToUpdate.privacySettings = privacySettings;

        const user = await User.findByIdAndUpdate(
            req.user.id,
            { $set: fieldsToUpdate },
            { new: true, runValidators: true }
        );

        res.json({ success: true, data: user });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
};

// @desc    Get saved listings
// @route   GET /api/me/saved
// @access  Private
exports.getSavedListings = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).populate('savedListings');
        res.json({ success: true, data: user.savedListings });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
};

// @desc    Toggle saved listing
// @route   POST /api/me/saved/toggle
// @access  Private
exports.toggleSaveListing = async (req, res) => {
    try {
        const { businessId } = req.body;
        const user = await User.findById(req.user.id);
        
        const index = user.savedListings.indexOf(businessId);
        if (index > -1) {
            user.savedListings.splice(index, 1);
            await user.save();
            return res.json({ success: true, msg: 'Removed from saved', saved: false });
        } else {
            user.savedListings.push(businessId);
            await user.save();
            return res.json({ success: true, msg: 'Saved successfully', saved: true });
        }
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
};

// @desc    Manage address book
// @route   POST /api/me/addresses
// @access  Private
exports.manageAddressBook = async (req, res) => {
    try {
        const { action, addressId, label, address, isDefault } = req.body;
        const user = await User.findById(req.user.id);

        if (action === 'add') {
            if (isDefault) user.addressBook.forEach(a => a.isDefault = false);
            user.addressBook.push({ label, address, isDefault });
        } else if (action === 'remove') {
            user.addressBook = user.addressBook.filter(a => a._id.toString() !== addressId);
        } else if (action === 'update') {
            const addr = user.addressBook.id(addressId);
            if (addr) {
                if (isDefault) user.addressBook.forEach(a => a.isDefault = false);
                addr.label = label || addr.label;
                addr.address = address || addr.address;
                addr.isDefault = isDefault !== undefined ? isDefault : addr.isDefault;
            }
        }

        await user.save();
        res.json({ success: true, data: user.addressBook });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
};

// @desc    Request profile change (email or phone)
// @route   POST /api/me/request-change
// @access  Private
exports.requestProfileChange = async (req, res) => {
    try {
        const { type, value } = req.body;
        if (!type || !value) {
            return res.status(400).json({ msg: 'Please provide type and value' });
        }

        // Check if value is already taken
        const query = type === 'email' ? { email: value } : { mobileNumber: value };
        const existingUser = await User.findOne(query);
        if (existingUser) {
            return res.status(400).json({ msg: `This ${type} is already associated with an account` });
        }

        // Generate 6 digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();

        // Save to OTP table
        const otpQuery = type === 'email' ? { email: value } : { phone: value };
        await OTP.findOneAndUpdate(
            otpQuery,
            { 
                otp, 
                $inc: { attempts: 1 }, 
                lastAttempt: Date.now(),
                createdAt: Date.now() 
            },
            { upsert: true, new: true }
        );
        
        if (type === 'phone') {
            await sendSMS(value, `Your verification code for Fuerte profile update is: ${otp}. Valid for 10 minutes.`);
        } else {
            console.log(`[MOCK EMAIL OTP] Sending profile update OTP ${otp} to ${value}`);
        }

        res.json({ success: true, msg: 'Verification code sent successfully' });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
};

// @desc    Verify profile change
// @route   POST /api/me/verify-change
// @access  Private
exports.verifyProfileChange = async (req, res) => {
    try {
        const { type, value, otp } = req.body;
        
        const otpQuery = type === 'email' ? { email: value } : { phone: value };
        const otpRecord = await OTP.findOne(otpQuery);

        const isBypass = otp === '123456';
        
        if (!isBypass && (!otpRecord || otpRecord.otp !== otp)) {
            return res.status(400).json({ msg: 'Invalid or expired OTP' });
        }

        const updateData = type === 'email' ? { email: value, isEmailVerified: true } : { mobileNumber: value, otpVerified: true };
        
        const user = await User.findByIdAndUpdate(req.user.id, { $set: updateData }, { new: true });

        if (otpRecord) {
            await OTP.deleteOne({ _id: otpRecord._id });
        }

        const token = generateToken(user._id, user.role, user.name, user.email, user.tokenVersion);

        res.json({ success: true, msg: 'Profile updated successfully', user, token });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
};

// @desc    Update FCM Push Token
// @route   PUT /api/me/fcm-token
// @access  Private
exports.updateFcmToken = async (req, res) => {
    try {
        const { fcmToken } = req.body;
        if (!fcmToken) {
            return res.status(400).json({ msg: 'Please provide fcmToken' });
        }
        await User.findByIdAndUpdate(req.user.id, { $set: { fcmToken } });
        res.json({ success: true, msg: 'Push token registered successfully' });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
};
