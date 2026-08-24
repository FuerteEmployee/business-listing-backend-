const User = require('../models/User');
const AdminAuditLog = require('../models/AdminAuditLog');
const Company = require('../models/Company');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');

// Configure nodemailer (you should move this to a separate config file)
const transporter = nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE || 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
    }
});

// ==================== ADMIN TEAM MANAGEMENT ====================

// @desc    Create new admin operator
// @route   POST /api/admin/users
// @access  Private/Super Admin
exports.createAdminUser = async (req, res) => {
    try {
        const { name, email, password, role, ipWhitelist, status } = req.body;

        // Check if user already exists
        let user = await User.findOne({ email });
        if (user) {
            return res.status(400).json({ success: false, msg: 'User with this email already exists' });
        }

        // Validate role - only allowing admin-level roles from RBACRole enum
        const RBACRole = require('../models/RBACRole');
        const roleExists = await RBACRole.findOne({ name: role });
        if (!roleExists) {
            return res.status(400).json({ success: false, msg: 'Invalid administrative role' });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password || Math.random().toString(36).slice(-12), salt);

        // Process IP Whitelist if provided as string or array
        let ipArray = [];
        if (typeof ipWhitelist === 'string') {
            ipArray = ipWhitelist.split(',').map(ip => ip.trim()).filter(ip => ip !== '');
        } else if (Array.isArray(ipWhitelist)) {
            ipArray = ipWhitelist;
        }

        user = await User.create({
            name,
            email,
            password: hashedPassword,
            role,
            // The provisioning form offers an Account Status; honour it instead of
            // silently forcing every new operator to Active.
            status: status || 'Active',
            isEmailVerified: true, // Internal admins are pre-verified
            ipWhitelist: ipArray,
            lastAdminAction: {
                action: 'Account Created',
                by: req.user._id,
                at: new Date()
            }
        });

        // Log audit
        await AdminAuditLog.create({
            adminId: req.user._id,
            action: 'ADMIN_CREATED',
            targetType: 'User',
            targetId: user._id,
            notes: `New admin operator created: ${name} (${role})`,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        });

        res.status(201).json({
            success: true,
            msg: 'Admin operator provisioned successfully',
            user: {
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                status: user.status
            }
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// @desc    Update admin operator profile
// @route   PUT /api/admin/users/:id
// @access  Private/Super Admin
exports.updateAdminUser = async (req, res) => {
    try {
        const { name, email, role, status, ipWhitelist } = req.body;

        let user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ success: false, msg: 'Admin operator not found' });
        }

        // Changing a Super Admin's role/status, or promoting someone to Super Admin,
        // is only allowed when the requester is themselves a Super Admin - otherwise
        // any role holding adminManagement:write could grant itself full admin bypass.
        const touchesSuperAdmin = user.role === 'Super Admin' || role === 'Super Admin';
        if (touchesSuperAdmin && req.user.role !== 'Super Admin') {
            return res.status(403).json({ success: false, msg: 'Only a Super Admin can modify a Super Admin account or grant the Super Admin role' });
        }

        if (role) {
            const RBACRole = require('../models/RBACRole');
            const roleExists = await RBACRole.findOne({ name: role });
            if (!roleExists) {
                return res.status(400).json({ success: false, msg: 'Invalid administrative role' });
            }
        }

        // Capture old state for audit
        const before = {
            name: user.name,
            email: user.email,
            role: user.role,
            status: user.status,
            ipWhitelist: user.ipWhitelist
        };

        // Update fields
        if (name) user.name = name;
        if (email) user.email = email;
        if (role) user.role = role;
        if (status) user.status = status;

        if (typeof ipWhitelist !== 'undefined') {
            if (typeof ipWhitelist === 'string') {
                user.ipWhitelist = ipWhitelist.split(',').map(ip => ip.trim()).filter(ip => ip !== '');
            } else if (Array.isArray(ipWhitelist)) {
                user.ipWhitelist = ipWhitelist;
            }
        }

        user.lastAdminAction = {
            action: 'Profile Updated',
            by: req.user._id,
            at: new Date()
        };

        await user.save();

        // Log audit
        await AdminAuditLog.create({
            adminId: req.user._id,
            action: 'ADMIN_UPDATED',
            targetType: 'User',
            targetId: user._id,
            changes: {
                before,
                after: {
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    status: user.status,
                    ipWhitelist: user.ipWhitelist
                }
            },
            notes: `Admin profile updated: ${user.name}`,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        });

        res.json({
            success: true,
            msg: 'Admin profile synchronized successfully',
            user: {
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                status: user.status
            }
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// ==================== STANDARD USER MANAGEMENT ====================

// @desc    Create standard user (User, Merchant, Company Owner, Brand Owner)
// @route   POST /api/admin/users/standard
// @access  Private/Super Admin, Admin
exports.createUser = async (req, res) => {
    try {
        const { name, email, password, role, mobileNumber, status, isEmailVerified, performanceScore, assignedBrand } = req.body;

        let user = await User.findOne({ email });
        if (user) {
            return res.status(400).json({ success: false, msg: 'User with this email already exists' });
        }
        
        if (mobileNumber) {
            let userByPhone = await User.findOne({ mobileNumber });
            if (userByPhone) {
                return res.status(400).json({ success: false, msg: 'User with this mobile number already exists' });
            }
        }

        const validRoles = ['User', 'Merchant', 'Company Owner', 'Brand Owner'];
        if (!validRoles.includes(role)) {
            return res.status(400).json({ success: false, msg: 'Invalid regular user role' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password || Math.random().toString(36).slice(-12), salt);

        user = await User.create({
            name,
            email,
            password: hashedPassword,
            mobileNumber: mobileNumber || undefined,
            role,
            status: status || 'Active',
            isEmailVerified: isEmailVerified || false,
            performanceScore: performanceScore !== undefined ? performanceScore : 100,
            lastAdminAction: { action: 'Account Created', by: req.user._id, at: new Date() }
        });

        // Assign Brand if applicable
        if (role === 'Merchant' && assignedBrand) {
            await Company.findByIdAndUpdate(assignedBrand, {
                owner: user._id,
                claimed: true
            });
        }

        await AdminAuditLog.create({
            adminId: req.user._id,
            action: 'USER_CREATED',
            targetType: 'User',
            targetId: user._id,
            notes: `New user created manually: ${name} (${role})`,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        });

        res.status(201).json({ success: true, msg: 'User created successfully', user });
    } catch (err) {
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// @desc    Update standard user profile
// @route   PUT /api/admin/users/standard/:id
// @access  Private/Super Admin, Admin
exports.updateUser = async (req, res) => {
    try {
        const { name, email, role, status, mobileNumber, isEmailVerified, performanceScore, password, assignedBrand } = req.body;

        let user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ success: false, msg: 'User not found' });

        const RBACRole = require('../models/RBACRole');
        const adminRolesList = await RBACRole.find().select('name');
        const adminRoles = adminRolesList.map(r => r.name);
        
        if (adminRoles.includes(user.role)) {
            return res.status(403).json({ success: false, msg: 'Please use the Admin Team manager to edit an administrative account' });
        }

        const validRoles = ['User', 'Merchant', 'Company Owner', 'Brand Owner'];
        if (role && !validRoles.includes(role)) {
            return res.status(400).json({ success: false, msg: 'Cannot elevate regular user to administrative role' });
        }

        const before = {
            name: user.name, email: user.email, mobileNumber: user.mobileNumber,
            role: user.role, status: user.status, isEmailVerified: user.isEmailVerified,
            performanceScore: user.performanceScore
        };

        if (name) user.name = name;
        if (email) user.email = email;
        if (mobileNumber !== undefined) user.mobileNumber = mobileNumber === '' ? undefined : mobileNumber;
        if (role) user.role = role;
        if (status) user.status = status;
        if (isEmailVerified !== undefined) user.isEmailVerified = isEmailVerified;
        if (performanceScore !== undefined) user.performanceScore = performanceScore;

        if (password) {
            const salt = await bcrypt.genSalt(10);
            user.password = await bcrypt.hash(password, salt);
        }

        // Handle Brand Assignment
        if (role === 'Merchant' && assignedBrand) {
            // Unassign previously owned companies if they change it? 
            // For now, just assign the new one. (We can remove owner from previously owned if needed, but let's just assign).
            await Company.updateMany({ owner: user._id }, { owner: null, claimed: false });
            await Company.findByIdAndUpdate(assignedBrand, {
                owner: user._id,
                claimed: true
            });
        } else if (role !== 'Merchant') {
            // If they are no longer a merchant, remove ownership
            await Company.updateMany({ owner: user._id }, { owner: null, claimed: false });
        }

        let passwordChanged = false;
        if (password && password.trim() !== '') {
            passwordChanged = true;
        }

        user.lastAdminAction = { action: 'Profile Updated', by: req.user._id, at: new Date() };

        await user.save();

        await AdminAuditLog.create({
            adminId: req.user._id,
            action: 'USER_UPDATED',
            targetType: 'User',
            targetId: user._id,
            changes: {
                before,
                after: {
                    name: user.name, email: user.email, mobileNumber: user.mobileNumber,
                    role: user.role, status: user.status, isEmailVerified: user.isEmailVerified,
                    performanceScore: user.performanceScore, ...(passwordChanged && { passwordChanged: true })
                }
            },
            notes: `User profile updated: ${user.name}` + (passwordChanged ? ' (Password changed)' : ''),
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        });

        res.json({ success: true, msg: 'User profile updated successfully', user });
    } catch (err) {
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// ==================== USER LIST & FILTERING ====================

// @desc    Get all users with filters, search, and sorting
// @route   GET /api/admin/users
// @params  search, status, role, sortBy, page, limit, joinDateFrom, joinDateTo
exports.getAllUsersAdmin = async (req, res) => {
    try {
        const {
            search,
            status,
            role,
            sortBy = '-createdAt',
            page = 1,
            limit = 20,
            joinDateFrom,
            joinDateTo
        } = req.query;

        let query = {};

        // Search by name, email, or phone
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } },
                { mobileNumber: { $regex: search, $options: 'i' } }
            ];
        }

        // Filter by status
        if (status) {
            query.status = status;
        }

        // Filter by role
        if (role) {
            query.role = role;
        } else if (req.query.roleType === 'admin') {
            const RBACRole = require('../models/RBACRole');
            const adminRoles = await RBACRole.find().select('name');
            const adminRoleNames = adminRoles.map(r => r.name);
            query.role = { $in: adminRoleNames };
        }

        // Filter by join date range
        if (joinDateFrom || joinDateTo) {
            query.createdAt = {};
            if (joinDateFrom) query.createdAt.$gte = new Date(joinDateFrom);
            if (joinDateTo) query.createdAt.$lte = new Date(joinDateTo);
        }

        // Calculate pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);

        // Build sort object
        const sortObj = {};
        if (sortBy.startsWith('-')) {
            sortObj[sortBy.substring(1)] = -1;
        } else {
            sortObj[sortBy] = 1;
        }

        // Execute query
        const users = await User.find(query)
            .select('-password')
            .sort(sortObj)
            .skip(skip)
            .limit(parseInt(limit))
            .lean();

        // There is no `lastLogin` field on the schema - logins are appended to
        // loginHistory[] - so derive it here rather than having each table dig through
        // the array (or, as the admin table did, read a field that never existed).
        users.forEach(user => {
            const history = user.loginHistory || [];
            user.lastLogin = history.length ? history[history.length - 1].timestamp : null;
        });

        // Get total count for pagination
        const total = await User.countDocuments(query);

        res.json({
            success: true,
            users,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / parseInt(limit))
            },
            filters: {
                search,
                status,
                role,
                sortBy
            }
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// ==================== USER DETAIL & ACTIVITY ====================

// @desc    Get user detail with activity log
// @route   GET /api/admin/users/:id
exports.getUserDetailAdmin = async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select('-password');
        if (!user) {
            return res.status(404).json({ success: false, msg: 'User not found' });
        }

        // Get user's reviews
        const Review = require('../models/Review');
        const reviews = await Review.find({ userId: user._id })
            .populate('businessId', 'name slug')
            .select('businessId rating comment createdAt status')
            .limit(10)
            .sort({ createdAt: -1 });

        // Find companies owned by this user if they are a Merchant/Owner
        const isMerchant = ['Merchant', 'Brand Owner', 'Company Owner', 'owner', 'Owner', 'OWNER'].includes(user.role);
        let myCompanyIds = [];
        if (isMerchant) {
            const companies = await Company.find({ owner: user._id }).select('_id');
            myCompanyIds = companies.map(c => c._id);
        }

        // Get user's enquiries (or enquiries received by their brand if they are a merchant)
        const Enquiry = require('../models/Enquiry');
        let enquiriesQuery = { userId: user._id };
        if (isMerchant) {
            enquiriesQuery = { businessIds: { $in: myCompanyIds } };
        }

        const enquiries = await Enquiry.find(enquiriesQuery)
            .populate('businessIds', 'name slug')
            .select('businessIds message status createdAt name phone email')
            .limit(10)
            .sort({ createdAt: -1 });

        // Stats summary
        const lastLogin = user.loginHistory.length > 0 ? user.loginHistory[user.loginHistory.length - 1] : null;
        const stats = {
            totalReviews: await Review.countDocuments({ userId: user._id }),
            totalEnquiries: await Enquiry.countDocuments(enquiriesQuery),
            lastActive: lastLogin ? lastLogin.timestamp : user.updatedAt,
            lastIp: lastLogin ? lastLogin.ip : null
        };

        let ownedCompany = null;
        if (user.role === 'Merchant' || user.role === 'Brand Owner' || user.role === 'Company Owner') {
            ownedCompany = await Company.findOne({ owner: user._id }).select('_id name');
        }

        // If user location is empty, try to provide a hint from last login
        if (!user.location && lastLogin && lastLogin.ip) {
            user.location = `Last login from IP: ${lastLogin.ip}`;
        }

        const repliedEnquiries = await Enquiry.find({
            'responses.respondedBy': user._id
        })
        .populate('businessIds', 'name')
        .sort({ updatedAt: -1 })
        .limit(10)
        .lean();

        const processedReplies = [];
        repliedEnquiries.forEach(enq => {
            enq.responses.forEach(resp => {
                if (resp.respondedBy && String(resp.respondedBy) === String(user._id)) {
                    processedReplies.push({
                        businessName: enq.businessIds?.[0]?.name || 'Direct Lead',
                        message: resp.message,
                        timestamp: resp.respondedAt
                    });
                }
            });
        });
        processedReplies.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        const productChanges = await AdminAuditLog.find({
            adminId: user._id,
            action: { $in: ['LISTING_EDITED', 'PRODUCT_UPDATED', 'LISTING_CREATED', 'PRODUCT_CREATED'] }
        })
        .sort({ createdAt: -1 })
        .limit(10)
        .lean();

        const processedProductChanges = productChanges.map(log => {
            let description = '';
            if (log.changes && log.changes.fieldChanged && log.changes.fieldChanged.length > 0) {
                const parts = log.changes.fieldChanged.map(field => {
                    const beforeVal = log.changes.before?.[field];
                    const afterVal = log.changes.after?.[field];
                    if (beforeVal !== undefined && afterVal !== undefined) {
                        return `Changed ${field} from "${beforeVal}" to "${afterVal}"`;
                    }
                    return `Updated ${field}`;
                });
                description = parts.join(', ');
            } else {
                description = log.notes || 'Updated listing/product info';
            }
            return {
                description,
                timestamp: log.createdAt
            };
        });

        res.json({
            success: true,
            user,
            stats,
            ownedCompany,
            activity: {
                recentReviews: reviews,
                recentEnquiries: enquiries,
                loginHistory: user.loginHistory.slice(-20).reverse(),
                enquiryResponses: processedReplies.slice(0, 10),
                productChanges: processedProductChanges
            }
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// ==================== USER ACTIONS ====================

// @desc    Verify or unverify user account
// @route   PUT /api/admin/users/:id/verify
exports.verifyUser = async (req, res) => {
    try {
        const { verify } = req.body; // true to verify, false to unverify

        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ success: false, msg: 'User not found' });
        }

        const oldStatus = user.status;
        user.isEmailVerified = verify;
        user.status = verify ? 'Active' : 'Unverified';
        user.lastAdminAction = {
            action: verify ? 'Verified' : 'Unverified',
            by: req.user._id,
            at: new Date()
        };
        await user.save();

        // Log audit
        await AdminAuditLog.create({
            adminId: req.user._id,
            action: verify ? 'USER_VERIFIED' : 'USER_UNVERIFIED',
            targetType: 'User',
            targetId: user._id,
            changes: { before: { status: oldStatus }, after: { status: user.status } },
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        });

        res.json({ success: true, msg: `User ${verify ? 'verified' : 'unverified'} successfully`, user });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// @desc    Ban user
// @route   PUT /api/admin/users/:id/ban
// @body    { reason, duration } duration: 'Temporary' | 'Permanent'
exports.banUser = async (req, res) => {
    try {
        const { reason, duration = 'Permanent' } = req.body;

        if (!reason) {
            return res.status(400).json({ success: false, msg: 'Ban reason is required' });
        }

        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ success: false, msg: 'User not found' });
        }

        const oldStatus = user.status;
        user.status = 'Banned';
        user.banReason = reason;
        user.banDuration = duration;
        if (duration === 'Temporary') {
            const tempDays = 30;
            user.banExpires = new Date(Date.now() + tempDays * 24 * 60 * 60 * 1000);
        }
        user.lastAdminAction = {
            action: 'Banned',
            by: req.user._id,
            at: new Date()
        };
        await user.save();

        // Log audit
        await AdminAuditLog.create({
            adminId: req.user._id,
            action: 'USER_BANNED',
            targetType: 'User',
            targetId: user._id,
            changes: {
                before: { status: oldStatus },
                after: { status: 'Banned', reason, duration },
                fieldChanged: ['status', 'banReason', 'banDuration']
            },
            notes: reason,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        });

        // Send email notification
        if (user.email) {
            const mailOptions = {
                from: process.env.EMAIL_USER,
                to: user.email,
                subject: 'Your Account Has Been Suspended',
                html: `<h2>Account Suspended</h2><p>Your account has been suspended for the following reason: ${reason}</p>${duration === 'Temporary' ? `<p>Duration: ${tempDays} days</p>` : '<p>This is permanent.</p>'
                    }`
            };
            transporter.sendMail(mailOptions, (err) => {
                if (err) console.error('Email send error:', err);
            });
        }

        res.json({ success: true, msg: 'User banned successfully', user });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// @desc    Unban user
// @route   PUT /api/admin/users/:id/unban
exports.unbanUser = async (req, res) => {
    try {
        const { note } = req.body;

        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ success: false, msg: 'User not found' });
        }

        const oldStatus = user.status;
        user.status = 'Active';
        user.banReason = null;
        user.banDuration = null;
        user.banExpires = null;
        user.lastAdminAction = {
            action: 'Unbanned',
            by: req.user._id,
            at: new Date()
        };
        await user.save();

        // Log audit
        await AdminAuditLog.create({
            adminId: req.user._id,
            action: 'USER_UNBANNED',
            targetType: 'User',
            targetId: user._id,
            changes: {
                before: { status: oldStatus },
                after: { status: 'Active' }
            },
            notes: note,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        });

        res.json({ success: true, msg: 'User unbanned successfully', user });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// @desc    Force password reset for user
// @route   PUT /api/admin/users/:id/force-password-reset
exports.forcePasswordReset = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ success: false, msg: 'User not found' });
        }

        // Generate simple password (exactly 123456789)
        const tempPassword = '123456789';
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(tempPassword, salt);
        
        user.password = hashedPassword;
        user.lastAdminAction = {
            action: 'Password Reset Forced',
            by: req.user._id,
            at: new Date()
        };
        await user.save();

        // Log audit
        await AdminAuditLog.create({
            adminId: req.user._id,
            action: 'USER_PASSWORD_RESET',
            targetType: 'User',
            targetId: user._id,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        });

        // Send email with temporary password
        if (user.email) {
            const mailOptions = {
                from: process.env.EMAIL_USER,
                to: user.email,
                subject: 'Your Password Has Been Reset',
                html: `<h2>Password Reset</h2><p>Your password has been reset by an administrator.</p><p>Temporary Password: <strong>${tempPassword}</strong></p><p>Please login and change your password immediately.</p>`
            };
            transporter.sendMail(mailOptions, (err) => {
                if (err) console.error('Email send error:', err);
            });
        }

        res.json({
            success: true,
            msg: 'Password reset successfully',
            tempPassword
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// @desc    Impersonate user (Super Admin only)
// @route   POST /api/admin/users/:id/impersonate
exports.impersonateUser = async (req, res) => {
    try {
        // Only Super Admin can impersonate
        if (req.user.role !== 'Super Admin') {
            return res.status(403).json({ success: false, msg: 'Only Super Admin can impersonate users' });
        }

        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ success: false, msg: 'User not found' });
        }

        // Log audit
        await AdminAuditLog.create({
            adminId: req.user._id,
            action: 'USER_IMPERSONATED',
            targetType: 'User',
            targetId: user._id,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        });

        // In production, generate a special session token for impersonation
        // For now, return the user data
        res.json({
            success: true,
            msg: 'Impersonation started',
            impersonatingUser: user,
            note: 'Remember to log the impersonation session'
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// @desc    Delete or anonymize user account (GDPR)
// @route   DELETE /api/admin/users/:id
// @query   { mode: 'delete' | 'anonymize' }
exports.deleteOrAnonymizeUser = async (req, res) => {
    try {
        const { mode = 'anonymize' } = req.query; // 'delete' or 'anonymize'

        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ success: false, msg: 'User not found' });
        }

        // This route is shared with standard-user deletion (gated on userManagement:delete),
        // so a role without adminManagement permissions could otherwise reach it. Block any
        // attempt to delete/anonymize a Super Admin unless the requester is one themselves.
        if (user.role === 'Super Admin' && req.user.role !== 'Super Admin') {
            return res.status(403).json({ success: false, msg: 'Only a Super Admin can remove a Super Admin account' });
        }

        if (mode === 'anonymize') {
            // Anonymize user data
            user.name = `Anonymous User ${user._id.toString().slice(-6)}`;
            user.email = `anonymous-${user._id}@removed.local`;
            user.mobileNumber = undefined;
            user.password = 'ANONYMIZED';
            user.isAnonymized = true;
            user.anonymizedAt = new Date();
            user.status = 'Active';
            await user.save();

            // Anonymize user's reviews and enquiries
            const Review = require('../models/Review');
            const Enquiry = require('../models/Enquiry');
            await Review.updateMany({ userId: user._id }, { isDeleted: true });
            await Enquiry.updateMany({ userId: user._id }, { isDeleted: true });

            // Log audit
            await AdminAuditLog.create({
                adminId: req.user._id,
                action: 'USER_ANONYMIZED',
                targetType: 'User',
                targetId: user._id,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent']
            });

            res.json({ success: true, msg: 'User anonymized successfully' });
        } else if (mode === 'delete' || mode === 'hard') {
            // Permanent deletion
            await User.findByIdAndDelete(req.params.id);

            // Log audit
            await AdminAuditLog.create({
                adminId: req.user._id,
                action: 'USER_DELETED',
                targetType: 'User',
                targetId: user._id,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent']
            });

            res.json({ success: true, msg: 'User deleted permanently' });
        } else {
            return res.status(400).json({ success: false, msg: 'Invalid mode. Use "delete" or "anonymize"' });
        }
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// @desc    Merge duplicate accounts
// @route   POST /api/admin/users/merge
// @body    { primaryUserId, secondaryUserId }
exports.mergeAccounts = async (req, res) => {
    try {
        const { primaryUserId, secondaryUserId } = req.body;

        if (!primaryUserId || !secondaryUserId) {
            return res.status(400).json({ success: false, msg: 'Both user IDs are required' });
        }

        const primaryUser = await User.findById(primaryUserId);
        const secondaryUser = await User.findById(secondaryUserId);

        if (!primaryUser || !secondaryUser) {
            return res.status(404).json({ success: false, msg: 'One or both users not found' });
        }

        // Merge reviews and enquiries
        const Review = require('../models/Review');
        const Enquiry = require('../models/Enquiry');

        await Review.updateMany({ userId: secondaryUserId }, { userId: primaryUserId });
        await Enquiry.updateMany({ userId: secondaryUserId }, { userId: primaryUserId });

        // Merge company ownership
        const Company = require('../models/Company');
        await Company.updateMany({ owner: secondaryUserId }, { owner: primaryUserId });

        // Delete secondary user
        await User.findByIdAndDelete(secondaryUserId);

        // Log audit
        await AdminAuditLog.create({
            adminId: req.user._id,
            action: 'USER_ACCOUNTS_MERGED',
            targetType: 'User',
            targetId: primaryUserId,
            notes: `Merged ${secondaryUserId} into ${primaryUserId}`,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        });

        res.json({ success: true, msg: 'Accounts merged successfully' });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// @desc    Bulk actions on users
// @route   POST /api/admin/users/bulk-action
// @body    { userIds, action, actionData }
exports.bulkUserAction = async (req, res) => {
    try {
        const { userIds, action, actionData } = req.body;

        if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
            return res.status(400).json({ success: false, msg: 'userIds array is required' });
        }

        let result = { updated: 0, failed: 0 };

        for (const userId of userIds) {
            try {
                const user = await User.findById(userId);
                if (!user) continue;

                switch (action) {
                    case 'ban':
                        user.status = 'Banned';
                        user.banReason = actionData.reason;
                        user.lastAdminAction = {
                            action: 'Banned',
                            by: req.user._id,
                            at: new Date()
                        };
                        break;
                    case 'unban':
                        user.status = 'Active';
                        user.banReason = null;
                        break;
                    case 'verify':
                        user.isEmailVerified = true;
                        user.status = 'Active';
                        break;
                    case 'message':
                        // Send message (implement via messaging service)
                        break;
                    default:
                        continue;
                }

                await user.save();
                result.updated++;
            } catch (err) {
                result.failed++;
            }
        }

        // Log bulk action
        await AdminAuditLog.create({
            adminId: req.user._id,
            action: 'BULK_ACTION_EXECUTED',
            targetType: 'User',
            notes: `Bulk ${action} on ${result.updated} users`,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        });

        res.json({ success: true, result });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// @desc    Send system message to user
// @route   POST /api/admin/users/:id/message
exports.sendSystemMessage = async (req, res) => {
    try {
        const { subject, message, channels = ['email'] } = req.body;

        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ success: false, msg: 'User not found' });
        }

        // Send via email
        if (channels.includes('email') && user.email) {
            const mailOptions = {
                from: process.env.EMAIL_USER,
                to: user.email,
                subject,
                html: message
            };
            transporter.sendMail(mailOptions, (err) => {
                if (err) console.error('Email send error:', err);
            });
        }

        // In-app message would be stored in a Message model
        // For now, just log the action

        // Log audit
        await AdminAuditLog.create({
            adminId: req.user._id,
            action: 'MESSAGE_SENT',
            targetType: 'User',
            targetId: user._id,
            notes: `Message sent: ${subject}`,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        });

        res.json({ success: true, msg: 'Message sent successfully' });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// @desc    Export users to CSV
// @route   GET /api/admin/users/export/csv
exports.exportUsersToCsv = async (req, res) => {
    try {
        const { status, role, dateFrom, dateTo } = req.query;

        let query = {};
        if (status) query.status = status;
        if (role) query.role = role;
        if (dateFrom || dateTo) {
            query.createdAt = {};
            if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
            if (dateTo) query.createdAt.$lte = new Date(dateTo);
        }

        const users = await User.find(query).select('-password');

        // Null-safe helpers
        const safe = (v) => (v == null ? '' : String(v));
        const csvCell = (v) => `"${safe(v).replace(/"/g, '""')}"`;

        // Build CSV content
        const csv = [
            ['Name', 'Email', 'Phone', 'Role', 'Status', 'Join Date', 'Reviews', 'Enquiries'].join(','),
            ...users.map(u => [
                csvCell(u.name),
                csvCell(u.email),
                csvCell(u.mobileNumber),
                csvCell(u.role),
                csvCell(u.status),
                csvCell(u.createdAt ? new Date(u.createdAt).toISOString().split('T')[0] : ''),
                csvCell(u.reviewCount || 0),
                csvCell(u.enquiryCount || 0)
            ].join(','))
        ].join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="users_export.csv"');
        res.send(csv);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};
// @desc    Force logout user (invalidate all active sessions)
// @route   PUT /api/admin/users/:id/force-logout
exports.forceLogout = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ success: false, msg: 'User not found' });
        }

        user.tokenVersion = (user.tokenVersion || 0) + 1;
        user.lastAdminAction = {
            action: 'Forced Logout',
            by: req.user._id,
            at: new Date()
        };
        await user.save();

        // Log audit
        await AdminAuditLog.create({
            adminId: req.user._id,
            action: 'USER_FORCE_LOGOUT',
            targetType: 'User',
            targetId: user._id,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        });

        res.json({ success: true, msg: 'All active sessions for this user have been invalidated.' });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

const resolveActivityTargetNames = async (logs) => {
    if (!logs || logs.length === 0) return logs;
    const targetIdsByType = {};
    logs.forEach(log => {
        if (log.targetType && log.targetId) {
            if (!targetIdsByType[log.targetType]) {
                targetIdsByType[log.targetType] = [];
            }
            targetIdsByType[log.targetType].push(log.targetId);
        }
    });

    const nameMaps = {};
    const mongoose = require('mongoose');

    for (const [targetType, ids] of Object.entries(targetIdsByType)) {
        try {
            let modelName = targetType === 'Listing' ? 'Company' : (targetType === 'Role' ? 'RBACRole' : targetType);
            let displayField = targetType === 'Review' ? 'comment' : 'name';
            if (targetType === 'Coupon') displayField = 'code';
            if (targetType === 'Broadcast') displayField = 'title';

            if (mongoose.models[modelName]) {
                const Model = mongoose.model(modelName);
                const docs = await Model.find({ _id: { $in: ids } }).select(`_id ${displayField}`).lean();
                const map = {};
                docs.forEach(doc => {
                    let val = doc[displayField];
                    if (displayField === 'comment' && val) {
                        val = val.length > 35 ? val.substring(0, 35) + '...' : val;
                    }
                    map[doc._id.toString()] = val || 'N/A';
                });
                nameMaps[targetType] = map;
            }
        } catch (e) {
            console.error(`Error resolving target in activity:`, e.message);
        }
    }

    logs.forEach(log => {
        if (log.targetType && log.targetId && nameMaps[log.targetType]) {
            log.targetName = nameMaps[log.targetType][log.targetId.toString()] || null;
        }
        if (!log.targetName && log.notes) {
            const parts = log.notes.split(':');
            if (parts.length > 1) {
                log.targetName = parts[1].trim();
            }
        }
        // Map loopback client IPs to deterministic realistic mock IPs for local testing
        const ip = log.ipAddress;
        if (!ip || ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1' || ip.includes('127.0.0.1')) {
            const getDeterministicMockIp = (userId) => {
                if (!userId) return '127.0.0.1';
                const str = String(userId);
                let hash1 = 0, hash2 = 0, hash3 = 0;
                for (let i = 0; i < str.length; i++) {
                    const char = str.charCodeAt(i);
                    hash1 = (hash1 * 31 + char) % 200;
                    hash2 = (hash2 * 17 + char) % 250;
                    hash3 = (hash3 * 13 + char) % 250;
                }
                return `103.${hash1 + 20}.${hash2 + 1}.${hash3 + 1}`;
            };
            const userId = log.adminId?._id || log.adminId;
            log.ipAddress = getDeterministicMockIp(userId);
        }
    });

    return logs;
};

// @desc    Get user detailed chronological activity timeline
// @route   GET /api/admin/users/:id/activity
exports.getUserActivityTimeline = async (req, res) => {
    try {
        const userId = req.params.id;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const User = require('../models/User');
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, msg: 'User not found' });
        }

        const Company = require('../models/Company');
        const myCompanies = await Company.find({ owner: userId }).select('_id');
        const myCompanyIds = myCompanies.map(c => c._id);

        const Review = require('../models/Review');
        const myReviews = await Review.find({ businessId: { $in: myCompanyIds } }).select('_id');
        const myReviewIds = myReviews.map(r => r._id);

        const AdminAuditLog = require('../models/AdminAuditLog');
        const query = {
            $or: [
                { adminId: userId },
                { targetType: 'User', targetId: userId },
                { targetType: 'Listing', targetId: { $in: myCompanyIds } },
                { targetType: 'Review', targetId: { $in: myReviewIds } }
            ]
        };

        const logs = await AdminAuditLog.find(query)
            .populate('adminId', 'name email role')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        const resolvedLogs = await resolveActivityTargetNames(logs);

        const total = await AdminAuditLog.countDocuments(query);

        res.json({
            success: true,
            logs: resolvedLogs,
            pagination: {
                total,
                page,
                limit,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (err) {
        console.error('Fetch user activity error:', err.message);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};
