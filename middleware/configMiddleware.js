const SystemConfig = require('../models/SystemConfig');

/**
 * Middleware to fetch and inject system configuration for a given panel.
 * It also enforces feature flags by blocking requests if a feature is hidden.
 * @param {string} panel - The panel making the request (e.g., 'admin', 'brand', 'frontend')
 */
const injectSystemConfig = (panel) => {
    return async (req, res, next) => {
        try {
            // Check if there's an active configuration for the panel
            let config = await SystemConfig.findOne({ panel, isActive: true });

            if (!config) {
                // If no config found, use defaults
                config = {
                    panel,
                    dbName: process.env.MONGO_DB_NAME || 'justdial',
                    paginationLimit: 10,
                    hiddenFeatures: []
                };
            }

            req.systemConfig = config;

            // Enforcement: If a route belongs to a hidden feature, block it.
            // Example: If 'fraud' is hidden, block all routes that are part of the fraud module.
            // This assumes routes are categorized/tagged or uses URL prefixing.
            const urlPath = req.baseUrl || req.path;
            const isBlocked = config.hiddenFeatures.some(feature => {
                // Simple pattern matching: if feature is 'fraud', block '/api/fraud'
                const regex = new RegExp(`^/api/${feature}(/|$)`, 'i');
                return regex.test(urlPath);
            });

            if (isBlocked) {
                return res.status(403).json({
                    msg: 'This feature is currently unavailable on this platform.',
                    code: 'FEATURE_DISABLED'
                });
            }

            // Automatic Pagination Enforcement
            // Inject the Master Control's pagination limit into the request query
            if (config.paginationLimit) {
                req.query.limit = req.query.limit || config.paginationLimit.toString();
            }

            next();
        } catch (err) {
            console.error('System Config Middleware Error:', err);
            next(); // Proceed with defaults if DB check fails
        }
    };
};

/**
 * Enforce the brand panel's hidden features (Master Control > brand) on brand-owner requests.
 * Brand owners share endpoints such as /api/products with admins and the public site, so this
 * is applied per route with the panel's feature keys rather than by URL prefix, and only to
 * brand-scoped users. Run it after `protect`.
 * @param {...string} features - Master Control keys that switch this route off (any one is enough)
 */
const brandFeature = (...features) => {
    return async (req, res, next) => {
        try {
            const { isBrandScoped } = require('./authMiddleware');
            if (!isBrandScoped(req.user)) return next();

            const config = await SystemConfig.findOne({ panel: 'brand', isActive: true }).select('hiddenFeatures').lean();
            const hidden = (config && config.hiddenFeatures) || [];
            if (features.some(f => hidden.includes(f))) {
                return res.status(403).json({
                    msg: 'This feature is currently unavailable on this platform.',
                    code: 'FEATURE_DISABLED'
                });
            }
            next();
        } catch (err) {
            console.error('Brand feature check error:', err);
            next();
        }
    };
};

module.exports = { injectSystemConfig, brandFeature };
