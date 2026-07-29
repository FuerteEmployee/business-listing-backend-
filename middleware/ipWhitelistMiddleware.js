const User = require('../models/User');

/**
 * @desc    Middleware to restrict access to whitelisted IPs for admin routes
 */
const ipWhitelist = async (req, res, next) => {
    // Only apply to Super Admin or Admin roles if needed, 
    // or just check if the user has a whitelist defined.
    
    if (!req.user) {
        return res.status(401).json({ msg: 'Authentication required for IP validation' });
    }

    // Skip check if user is not in a role that requires whitelisting (optional)
    // For now, if ipWhitelist is empty, allow all. If not empty, restrict.
    // Only apply if user has a whitelist defined
    if (!req.user.ipWhitelist || req.user.ipWhitelist.length === 0) {
        return next();
    }

    // Get client IP
    // Handling cases where there might be a proxy
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0] || 
                     req.ip || 
                     req.connection.remoteAddress;
    
    // Normalize IPv6 localhost to IPv4
    const normalizedIp = clientIp === '::1' ? '127.0.0.1' : clientIp;

    const isWhitelisted = req.user.ipWhitelist.includes(normalizedIp) || 
                          normalizedIp === '127.0.0.1';

    if (!isWhitelisted) {
        console.warn(`[SECURITY] Blocked admin access attempt from unauthorized IP: ${normalizedIp} (User: ${req.user.email})`);
        return res.status(403).json({ 
            success: false,
            msg: 'Access Denied: Your current IP address is not whitelisted for administrative access.',
            attemptedIp: normalizedIp
        });
    }

    next();
};

module.exports = ipWhitelist;
