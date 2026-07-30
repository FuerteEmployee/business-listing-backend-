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

/**
 * Roles whose data access is limited to the brands (companies) they own.
 * Every other authenticated role - Super Admin and the custom RBAC admin roles -
 * sees the whole platform.
 *
 * 'Merchant' is the role the admin Users form and the spreadsheet import assign to
 * listing owners, so it must be here; leaving it out is what let merchants read and
 * write other tenants' catalogues. The lower/upper-case 'owner' spellings come from
 * older records and the importer, which never normalised the role string.
 */
const BRAND_SCOPED_ROLES = ['Brand Owner', 'Company Owner', 'Merchant', 'owner', 'Owner', 'OWNER'];
exports.BRAND_SCOPED_ROLES = BRAND_SCOPED_ROLES;

/** True when this user may only see/act on their own brands. */
const isBrandScoped = (user) => !!user
    && user.role !== 'Super Admin'
    && BRAND_SCOPED_ROLES.includes(user.role);
exports.isBrandScoped = isBrandScoped;

/** True when `listingId` is one of the brands owned by the requesting user. */
exports.ownsBrand = (req, listingId) => !!listingId
    && (req.ownedBrandIds || []).some(id => id.toString() === listingId.toString());

/**
 * Every brand id the user may act on: the companies they own plus the companyId
 * carried on their profile/token. Registration auto-creates a company and stamps
 * it on the user, so that id counts as theirs even when the Company.owner
 * back-reference was never written.
 */
const collectOwnedBrandIds = async (user) => {
    const companies = await Company.find({ owner: user._id }).select('_id');
    const ids = companies.map(c => c._id);

    const ownCompany = user.companyId || user.company;
    if (ownCompany && !ids.some(id => id.toString() === ownCompany.toString())) {
        ids.push(ownCompany);
    }
    return ids;
};

// Middleware to find and attach all brands (companies) owned by the current user
exports.attachOwnedBrands = async (req, res, next) => {
    if (!req.user) return next();

    // Super Admin sees everything anyway, but for Brand Owners we need specific IDs
    req.ownedBrandIds = await collectOwnedBrandIds(req.user);
    next();
};

/**
 * Attach the user and their owned brands when a usable token is present, but never
 * reject the request. For public endpoints that also serve owner-scoped data.
 *
 * Deliberately does not delegate to `protect`: that helper answers with 401 itself,
 * which would break the public response for an expired or malformed token.
 */
exports.optionalAuth = async (req, res, next) => {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) return next();

    try {
        const decoded = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET || 'fallback_secret');
        const user = await User.findById(decoded.id);
        const tokenCurrent = typeof decoded.tokenVersion === 'undefined'
            || decoded.tokenVersion === user?.tokenVersion;

        if (user && tokenCurrent) {
            // Mirror `protect` so downstream tenancy checks see the same companyId
            user.companyId = decoded.companyId || user.company || user.companyId;
            user.company = user.companyId;

            req.user = user;
            req.ownedBrandIds = await collectOwnedBrandIds(user);
        }
    } catch (err) {
        // Invalid or expired token on a public route - continue anonymously.
    }
    next();
};

// Older name for the same middleware, still used by some route files.
exports.optionalProtect = exports.optionalAuth;

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

// Admin middleware - shorthand for authorize('Super Admin')
exports.admin = exports.authorize('Super Admin');
