const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const axios = require('axios');
const { OAuth2Client } = require('google-auth-library');
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const generateToken = (id, role, name, email, companyId, tokenVersion = 0) => {
    return jwt.sign({ id, role, name, email, companyId, tokenVersion }, process.env.JWT_SECRET || 'fallback_secret', {
        expiresIn: '30d',
    });
};

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public
exports.register = async (req, res) => {
    try {
        const { name, email, password, mobileNumber, role } = req.body;

        let user = await User.findOne({ email });
        if (user) {
            return res.status(400).json({ msg: 'Email is already registered' });
        }

        if (mobileNumber) {
            let phoneUser = await User.findOne({ mobileNumber });
            if (phoneUser) {
                return res.status(400).json({ msg: 'Mobile number is already registered' });
            }
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Verification token (simulated for now)
        const verificationToken = Math.random().toString(36).substring(2, 15);

        user = await User.create({
            name,
            email,
            mobileNumber,
            password: hashedPassword,
            role: role || 'User',
            verificationToken
        });

        // Auto-create company for merchants/owners
        const isMerchant = ['Brand Owner', 'Company Owner', 'Merchant', 'owner', 'Owner', 'OWNER'].includes(user.role);
        if (isMerchant) {
            const CategoryModel = require('../models/Category');
            const CompanyModel = require('../models/Company');
            const slugify = require('slugify');

            const defaultCategory = await CategoryModel.findOne({ status: 'Active' });
            const categoryName = defaultCategory ? defaultCategory.name : 'Services';
            const categoryId = defaultCategory ? defaultCategory._id : null;

            const companyName = `${name}'s Business`;
            let companySlug = slugify(companyName, { lower: true, strict: true });

            let slugExists = await CompanyModel.findOne({ slug: companySlug });
            if (slugExists) {
                companySlug = `${companySlug}-${Math.floor(Math.random() * 1000)}`;
            }

            const userCompany = await CompanyModel.create({
                name: companyName,
                slug: companySlug,
                category: categoryName,
                category_id: categoryId,
                owner: user._id,
                claimed: true,
                verified: true
            });

            // Update user with company references
            user.company = userCompany._id;
            user.companyId = userCompany._id;
            user.companiesOwned = 1;
            await user.save();
        }

        // In a real app, send email here using nodemailer
        console.log(`Email verification link: http://localhost:5173/verify-email/${verificationToken}`);

        const token = generateToken(user._id, user.role, user.name, user.email, user.company || user.companyId, user.tokenVersion);

        res.status(201).json({
            success: true,
            token,
            user: { _id: user._id, name: user.name, email: user.email, role: user.role }
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ msg: 'Please provide an email and password' });
        }

        // Check for user by email or mobile number (include invisible password field)
        const searchEmail = typeof email === 'string' ? email.toLowerCase() : email;
        const cleanPhone = typeof email === 'string' ? email.replace(/[\s\-\(\)\+]/g, '') : email;
        const user = await User.findOne({
            $or: [
                { email: searchEmail },
                { mobileNumber: email },
                { mobileNumber: cleanPhone }
            ]
        }).select('+password');
        if (!user) {
            return res.status(401).json({ msg: 'Invalid credentials' });
        }

        // Check if password matches
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ msg: 'Invalid credentials' });
        }

        // Check if status is suspended or banned
        if (user.status === 'Suspended' || user.status === 'Banned') {
            const reason = user.banReason ? ` Reason: ${user.banReason}` : '';
            return res.status(403).json({ msg: `Account ${user.status.toLowerCase()}. Contact support.${reason}` });
        }

        // Record login history
        user.loginHistory.push({
            device: req.headers['user-agent'],
            ip: req.ip || req.connection.remoteAddress,
            timestamp: new Date()
        });

        // Keep only last 10 sessions
        if (user.loginHistory.length > 10) {
            user.loginHistory.shift();
        }

        await user.save();

        try {
            const AdminAuditLog = require('../models/AdminAuditLog');
            await AdminAuditLog.create({
                adminId: user._id,
                action: 'USER_LOGIN',
                targetType: 'User',
                targetId: user._id,
                notes: `${user.name} logged in successfully`,
                ipAddress: req.ip || req.connection?.remoteAddress,
                userAgent: req.headers['user-agent']
            });
        } catch (auditErr) {
            console.error('Audit log login record fail:', auditErr.message);
        }

        const token = generateToken(user._id, user.role, user.name, user.email, user.company || user.companyId, user.tokenVersion);

        res.json({
            success: true,
            token,
            user: { _id: user._id, name: user.name, email: user.email, role: user.role }
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
};

// @desc    Get current logged in user
// @route   GET /api/auth/me
// @access  Private
exports.getMe = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        res.json({
            success: true,
            data: user
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
};

// @desc    Verify Email
// @route   GET /api/auth/verify/:token
// @access  Public
exports.verifyEmail = async (req, res) => {
    try {
        const user = await User.findOne({ verificationToken: req.params.token });

        if (!user) {
            return res.status(400).json({ msg: 'Invalid verification token' });
        }

        user.isEmailVerified = true;
        user.verificationToken = undefined;
        await user.save();

        res.json({ success: true, msg: 'Email verified successfully' });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
};

// @desc    Forgot Password
// @route   POST /api/auth/forgotpassword
// @access  Public
exports.forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email });

        if (!user) {
            return res.status(404).json({ msg: 'There is no user with that email' });
        }

        // Get reset token
        const resetToken = crypto.randomBytes(20).toString('hex');

        // Set reset password fields
        user.resetPasswordToken = crypto
            .createHash('sha256')
            .update(resetToken)
            .digest('hex');

        user.resetPasswordExpire = Date.now() + 10 * 60 * 1000; // 10 minutes

        await user.save();

        // In a real app, send email here
        console.log(`Password reset link: http://localhost:5173/resetpassword/${resetToken}`);

        res.json({ success: true, msg: 'Password reset link sent to your email (check console logs for link)' });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
};

// @desc    Reset Password
// @route   PUT /api/auth/resetpassword/:token
// @access  Public
exports.resetPassword = async (req, res) => {
    try {
        // Get hashed token
        const resetPasswordToken = crypto
            .createHash('sha256')
            .update(req.params.token)
            .digest('hex');

        const user = await User.findOne({
            resetPasswordToken,
            resetPasswordExpire: { $gt: Date.now() }
        });

        if (!user) {
            return res.status(400).json({ msg: 'Invalid or expired reset token' });
        }

        // Set new password
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(req.body.password, salt);
        user.resetPasswordToken = undefined;
        user.resetPasswordExpire = undefined;

        await user.save();

        // Log to AdminAuditLog
        try {
            const AdminAuditLog = require('../models/AdminAuditLog');
            await AdminAuditLog.create({
                adminId: user._id,
                action: 'USER_PASSWORD_CHANGED',
                targetType: 'User',
                targetId: user._id,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent'],
                notes: `${user.name} reset their password via token`
            });
        } catch (auditErr) {
            console.error('Failed to log reset password audit:', auditErr.message);
        }

        res.json({ success: true, msg: 'Password updated successfully' });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
};

// @desc    Delete user account
// @route   DELETE /api/auth/account
// @access  Private
exports.deleteAccount = async (req, res) => {
    try {
        await User.findByIdAndDelete(req.user.id);

        res.json({
            success: true,
            msg: 'Account permanently deleted'
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
};

// @desc    Deactivate user account
// @route   PUT /api/auth/deactivate
// @access  Private
exports.deactivateAccount = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        
        user.status = 'Suspended';
        user.banReason = 'Account deactivated by user';
        // Invalidate all tokens by incrementing version
        user.tokenVersion += 1;
        
        await user.save();

        res.json({
            success: true,
            msg: 'Account deactivated and logged out from all devices'
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
};

// @desc    Get user's login history / sessions
// @route   GET /api/auth/sessions
// @access  Private
exports.getSessions = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('loginHistory');
        
        res.json({
            success: true,
            sessions: user.loginHistory
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
};

// @desc    Revoke all sessions (except current is hard with JWT alone, so we revoke ALL)
// @route   DELETE /api/auth/sessions
// @access  Private
exports.revokeAllSessions = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        
        // Incrementing token version invalidates ALL current tokens in our protect middleware
        user.tokenVersion += 1;
        await user.save();

        res.json({
            success: true,
            msg: 'All active sessions have been invalidated. Please login again.'
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
};

// @desc    Revoke a specific session
// @route   DELETE /api/auth/sessions/:id
// @access  Private
exports.revokeSession = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ msg: 'User not found' });

        user.loginHistory = user.loginHistory.filter(s => String(s._id) !== String(req.params.id));
        await user.save();

        res.json({
            success: true,
            msg: 'Session revoked successfully.',
            sessions: user.loginHistory
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
};

// @desc    Google OAuth Login
// @route   POST /api/auth/google
// @access  Public
exports.googleLogin = async (req, res) => {
    try {
        const { tokenId } = req.body;

        if (!tokenId) {
            return res.status(400).json({ success: false, msg: 'ID Token is required' });
        }

        // Verify the token
        let payload;
        if (process.env.NODE_ENV === 'development' && tokenId === 'dev-google-token') {
            payload = {
                name: 'Test Google User',
                email: 'google-test@example.com',
                picture: 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png',
                sub: '123456789'
            };
        } else {
            const ticket = await client.verifyIdToken({
                idToken: tokenId,
                audience: process.env.GOOGLE_CLIENT_ID
            });
            payload = ticket.getPayload();
        }

        const { name, email, picture, sub } = payload;

        // Check if user exists
        let user = await User.findOne({ email });

        if (user) {
            // Check status
            if (user.status === 'Suspended' || user.status === 'Banned') {
                return res.status(403).json({ success: false, msg: `Account ${user.status.toLowerCase()}. Contact support.` });
            }
            
            // Re-activate if was suspended by user deactivation
            if (user.status === 'Suspended' && user.banReason === 'Account deactivated by user') {
                user.status = 'Active';
                user.banReason = undefined;
            }

            // Update login history
            user.loginHistory.push({
                device: req.headers['user-agent'],
                ip: req.ip,
                timestamp: new Date()
            });
            if (user.loginHistory.length > 10) user.loginHistory.shift();
            
            await user.save();
        } else {
            // Create new user (automatically verified since it's from Google)
            user = await User.create({
                name,
                email,
                googleId: sub,
                profilePhoto: picture,
                isEmailVerified: true,
                status: 'Active',
                password: crypto.randomBytes(16).toString('hex'), // Random password for OAuth users
                loginHistory: [{
                    device: req.headers['user-agent'],
                    ip: req.ip,
                    timestamp: new Date()
                }]
            });
        }

        // Ensure googleId is set if it was a pre-existing email-only account
        if (!user.googleId) {
            user.googleId = sub;
            await user.save();
        }

        try {
            const AdminAuditLog = require('../models/AdminAuditLog');
            await AdminAuditLog.create({
                adminId: user._id,
                action: 'USER_LOGIN',
                targetType: 'User',
                targetId: user._id,
                notes: `${user.name} logged in via Google successfully`,
                ipAddress: req.ip || req.connection?.remoteAddress,
                userAgent: req.headers['user-agent']
            });
        } catch (auditErr) {
            console.error('Audit log google login record fail:', auditErr.message);
        }

        const token = generateToken(user._id, user.role, user.name, user.email, user.company || user.companyId, user.tokenVersion);

        res.json({
            success: true,
            token,
            user: {
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                profilePhoto: user.profilePhoto
            }
        });
    } catch (err) {
        console.error('Google Auth Error:', err.message);
        res.status(401).json({ success: false, msg: 'Google Authentication failed' });
    }
};

// @desc    Facebook OAuth Login
// @route   POST /api/auth/facebook
// @access  Public
exports.facebookLogin = async (req, res) => {
    try {
        const { accessToken, userId } = req.body;

        if (!accessToken || !userId) {
            return res.status(400).json({ success: false, msg: 'Facebook Access Token and User ID are required' });
        }

        // Verify with Facebook Graph API
        const fbRes = await axios.get(`https://graph.facebook.com/me?fields=name,email,picture&access_token=${accessToken}`);
        const { name, email, picture, id } = fbRes.data;

        if (id !== userId) {
            return res.status(401).json({ success: false, msg: 'Facebook verification mismatch' });
        }

        // Check if user exists
        let user = await User.findOne({ 
            $or: [
                { facebookId: id },
                { email: email }
            ]
        });

        if (user) {
            if (user.status === 'Suspended' || user.status === 'Banned') {
                return res.status(403).json({ success: false, msg: `Account ${user.status.toLowerCase()}. Contact support.` });
            }
            
            // Link facebookId if not present
            if (!user.facebookId) user.facebookId = id;
            if (!user.profilePhoto && picture?.data?.url) user.profilePhoto = picture.data.url;
            
            user.loginHistory.push({
                device: req.headers['user-agent'],
                ip: req.ip,
                timestamp: new Date()
            });
            if (user.loginHistory.length > 10) user.loginHistory.shift();
            
            await user.save();
        } else {
            // Create user
            user = await User.create({
                name,
                email,
                facebookId: id,
                profilePhoto: picture?.data?.url,
                isEmailVerified: true,
                status: 'Active',
                password: crypto.randomBytes(16).toString('hex'),
                loginHistory: [{
                    device: req.headers['user-agent'],
                    ip: req.ip,
                    timestamp: new Date()
                }]
            });
        }

        try {
            const AdminAuditLog = require('../models/AdminAuditLog');
            await AdminAuditLog.create({
                adminId: user._id,
                action: 'USER_LOGIN',
                targetType: 'User',
                targetId: user._id,
                notes: `${user.name} logged in via Facebook successfully`,
                ipAddress: req.ip || req.connection?.remoteAddress,
                userAgent: req.headers['user-agent']
            });
        } catch (auditErr) {
            console.error('Audit log facebook login record fail:', auditErr.message);
        }

        const token = generateToken(user._id, user.role, user.name, user.email, user.company || user.companyId, user.tokenVersion);

        res.json({
            success: true,
            token,
            user: {
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                profilePhoto: user.profilePhoto
            }
        });
    } catch (err) {
        console.error('Facebook Auth Error:', err.response?.data || err.message);
        res.status(401).json({ success: false, msg: 'Facebook Authentication failed' });
    }
};

// @desc    Logout user
// @route   POST /api/auth/logout
// @access  Private
exports.logout = async (req, res) => {
    try {
        const AdminAuditLog = require('../models/AdminAuditLog');
        await AdminAuditLog.create({
            adminId: req.user._id,
            action: 'USER_LOGOUT',
            targetType: 'User',
            targetId: req.user._id,
            notes: `${req.user.name} logged out successfully`,
            ipAddress: req.ip || req.connection?.remoteAddress,
            userAgent: req.headers['user-agent']
        });
        res.json({ success: true, msg: 'Logged out successfully' });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ success: false, msg: 'Server Error' });
    }
};
