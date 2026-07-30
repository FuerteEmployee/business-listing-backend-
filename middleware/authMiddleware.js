const jwt = require('jsonwebtoken');
const RBACRole = require('../models/RBACRole');
const User = require('../models/User');
const Company = require('../models/Company');

// Protect routes
exports.protect = async (req, res, next) => {
    let token;

    if (
        req.headers.authorization &&
        req.headers.authorization.startsWith('Bearer')
    ) {
        token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
        return res.status(401).json({ msg: 'Not authorized to access this route' });
    }

    try {
        // Verify token
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
        
        // Find user and attach to request
        console.log('Decoded Token:', decoded);
        const user = await User.findById(decoded.id);
        if (!user) {
            return res.status(401).json({ msg: 'User no longer exists' });
        }
        
        // Check if token version matches (for force logout)
        if (typeof decoded.tokenVersion !== 'undefined' && decoded.tokenVersion !== user.tokenVersion) {
            return res.status(401).json({ msg: 'Session invalidated. Please login again.' });
        }
        
        // Explicitly set companyId for multi-tenancy isolation
        user.companyId = decoded.companyId || user.company || user.companyId;
        user.company = user.companyId;
        
        req.user = user;
        console.log('User attached to request:', user);
        next();
    } catch (err) {
        return res.status(401).json({ msg: 'Not authorized to access this route' });
    }
};

// Middleware to find and attach all brands (companies) owned by the current user
exports.attachOwnedBrands = async (req, res, next) => {
    if (!req.user) return next();

    // Super Admin sees everything anyway, but for Brand Owners we need specific IDs
    // Find all companies where this user is the owner
    const companies = await Company.find({ owner: req.user._id });
    req.ownedBrandIds = companies.map(c => c._id);
    next();
};

// Grant access to specific roles
exports.authorize = (...roles) => {
    return (req, res, next) => {
        if (!req.user || typeof req.user.role === 'undefined') {
            return res.status(401).json({ msg: 'User not authenticated or role missing.' });
        }
        // Super Admin always authorized for everything
        if (req.user.role === 'Super Admin') return next();
        
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                msg: `User role ${req.user.role} is not authorized to access this route`
            });
        }
        next();
    };
};

/**
 * Check if the user has a specific permission in their role
 * @param {string} module - The name of the module (e.g., 'userManagement')
 * @param {string} action - The action to perform (e.g., 'read', 'write', 'delete', 'approve', 'execute', 'export')
 */
exports.checkPermission = (module, action) => {
    return async (req, res, next) => {
        if (!req.user || !req.user.role) {
            return res.status(401).json({ msg: 'Authentication required' });
        }

        // Super Admin has all permissions bypass
        if (req.user.role === 'Super Admin') return next();

        try {
            const role = await RBACRole.findOne({ name: req.user.role });
            
            if (!role) {
                return res.status(403).json({ msg: `Role '${req.user.role}' not found in system` });
            }

            const permissions = role.permissions || {};
            const modulePermissions = permissions[module] || {};
            
            if (modulePermissions[action] === true) {
                return next();
            }

            return res.status(403).json({ 
                msg: `Access Denied: You do not have '${action}' permission for '${module}'` 
            });
        } catch (err) {
            console.error('RBAC Error:', err);
            return res.status(500).json({ msg: 'Authorization system error' });
        }
    };
};

// Optional protect: Decodes JWT if present but doesn't block request if missing or invalid
exports.optionalProtect = async (req, res, next) => {
    let token;

    if (
        req.headers.authorization &&
        req.headers.authorization.startsWith('Bearer')
    ) {
        token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
        return next();
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
        const user = await User.findById(decoded.id);
        if (user) {
            user.companyId = decoded.companyId || user.company || user.companyId;
            user.company = user.companyId;
            req.user = user;
        }
        next();
    } catch (err) {
        // Continue without user if token is invalid/expired in optional protect mode
        next();
    }
};

// Admin middleware - shorthand for authorize('Super Admin')
exports.admin = exports.authorize('Super Admin');
