const Setting = require('../models/Setting');
const SystemConfig = require('../models/SystemConfig');

// Settings that must never reach an unauthenticated caller. See getSettings.
const ADMIN_ONLY_SETTING_FIELDS = ['rankingWeights', 'hiddenFeatures', '__v'];

const sanitizeDiscoveryChips = (chips) => {
    if (!Array.isArray(chips)) return [];
    const clean = chips.filter(chip => chip && typeof chip.slug === 'string');
    return clean;
};

/**
 * Get panel-specific configuration (publicly accessible but limited)
 * @param {string} panel - admin | merchant | frontend
 */
exports.getPanelConfig = async (req, res) => {
    try {
        const { panel } = req.query;
        if (!['admin', 'merchant', 'frontend'].includes(panel)) {
            return res.status(400).json({ success: false, message: 'Invalid panel' });
        }

        let config = await SystemConfig.findOne({ panel, isActive: true });
        
        // Return only what the frontend needs to know (not internal DB names unless needed)
        // For security, we might not want to expose the true dbName to everyone, 
        // but since it's just for the app logic, it's fine for now if it's needed locally.
        res.status(200).json({ 
            success: true, 
            config: config || {
                panel,
                paginationLimit: 10,
                hiddenFeatures: []
            }
        });
    } catch (error) {
        console.error('Error in getPanelConfig:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Get global settings (public or used everywhere so public is fine)
const isImageUrl = (url) => {
    if (!url || typeof url !== 'string') return false;
    return /\.(png|jpe?g|gif|webp|svg|avif)(\?.*)?$/i.test(url) || /\/(image|upload)\//i.test(url);
};

exports.getSettings = async (req, res) => {
    try {
        let settings = await Setting.findOne();

        // If settings doc doesn't exist, create one with defaults
        if (!settings) {
            settings = await Setting.create({});
        }

        const safeSettings = settings.toObject ? settings.toObject() : { ...settings };
        if (safeSettings.logoUrl && !isImageUrl(safeSettings.logoUrl)) {
            safeSettings.logoUrl = safeSettings.faviconUrl || '';
        }

        safeSettings.socialLinks = {
            facebook: safeSettings.socialLinks?.facebook || '',
            twitter: safeSettings.socialLinks?.twitter || '',
            instagram: safeSettings.socialLinks?.instagram || '',
            linkedin: safeSettings.socialLinks?.linkedin || '',
            youtube: safeSettings.socialLinks?.youtube || '',
            whatsapp: safeSettings.socialLinks?.whatsapp || ''
        };

        if (safeSettings.homepage) {
            const cleanedChips = sanitizeDiscoveryChips(safeSettings.homepage.discoveryChips);
            safeSettings.homepage.discoveryChips = cleanedChips;
            if (!cleanedChips.length) {
                safeSettings.homepage.showDiscovery = false;
            }
        }

        // rankingWeights tells anyone how to game search placement (and that paying
        // buys a 1.5x multiplier); hiddenFeatures enumerates the admin surface.
        // Neither is needed to render the public site, so only Super Admins see them.
        // Mounted with optionalAuth, so req.user is set when a valid token is sent.
        if (req.user?.role !== 'Super Admin') {
            ADMIN_ONLY_SETTING_FIELDS.forEach(field => delete safeSettings[field]);
        }

        res.status(200).json({ success: true, data: safeSettings });
    } catch (error) {
        console.error('Error in getSettings:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Update global settings (Super Admin only)
exports.updateSettings = async (req, res) => {
    try {
        let settings = await Setting.findOne();

        if (!settings) {
            settings = new Setting();
        }

        // Handle homepage subdocument explicitly — avoid .set() spread which loses arrays
        if (req.body.homepage) {
            console.log('Synchronizing homepage configuration...');
            const hp = req.body.homepage;

            if (hp.discoveryChips) {
                hp.discoveryChips = sanitizeDiscoveryChips(hp.discoveryChips);
            }

            // Assign each scalar field individually
            const boolFields = [
                'showHero', 'showRecentlyViewed', 'showBanners', 'showCategories',
                'showDiscovery', 'showAds', 'showFeatured', 'showPopular',
                'showLatest', 'showReviews', 'showCTA', 'showMobileApp', 'showFooter'
            ];
            boolFields.forEach(f => {
                if (hp[f] !== undefined) settings.homepage[f] = hp[f];
            });

            const stringFields = [
                'footerText', 'heroTaglinePrefix', 'heroTaglineSuffix',
                'countSource', 'fixedCount', 'searchPlaceholder'
            ];
            stringFields.forEach(f => {
                if (hp[f] !== undefined) settings.homepage[f] = hp[f];
            });

            // Assign array fields directly — this is the critical fix
            if (hp.trendingSearches !== undefined) {
                settings.homepage.trendingSearches = hp.trendingSearches;
                settings.markModified('homepage.trendingSearches');
            }

            if (hp.footerSections !== undefined) {
                console.log('Footer Sections Sync - Count:', hp.footerSections.length);
                settings.homepage.footerSections = hp.footerSections;
                settings.markModified('homepage.footerSections');
            }

            if (hp.socialLinks !== undefined) {
                console.log('Social Links Sync - Count:', hp.socialLinks.length);
                console.log('Social Links Data:', JSON.stringify(hp.socialLinks, null, 2));
                settings.homepage.socialLinks = hp.socialLinks;
                settings.markModified('homepage.socialLinks');
            }

            if (hp.discoveryChips !== undefined) {
                settings.homepage.discoveryChips = hp.discoveryChips;
                settings.markModified('homepage.discoveryChips');
            }

            settings.markModified('homepage');
        }
        
        // Update other top-level fields.
        // Keyed on `!== undefined` rather than truthiness: an empty string is a deliberate
        // "clear this field" instruction, and a truthy check silently discarded it, so the
        // old value reappeared on the next refresh.
        const TEXT_FIELDS = [
            'siteName', 'logoUrl', 'faviconUrl',
            'primaryColor', 'secondaryColor',
            'contactEmail', 'contactPhone'
        ];
        TEXT_FIELDS.forEach(field => {
            if (req.body[field] !== undefined) settings[field] = req.body[field];
        });
        if (req.body.socialLinks) {
            settings.socialLinks = {
                facebook: req.body.socialLinks.facebook || '',
                twitter: req.body.socialLinks.twitter || '',
                instagram: req.body.socialLinks.instagram || '',
                linkedin: req.body.socialLinks.linkedin || '',
                youtube: req.body.socialLinks.youtube || '',
                whatsapp: req.body.socialLinks.whatsapp || ''
            };
            settings.markModified('socialLinks');
        }
        if (req.body.footerText !== undefined) settings.footerText = req.body.footerText;
        if (req.body.showFooter !== undefined) settings.showFooter = req.body.showFooter;
        if (req.body.rankingWeights) settings.rankingWeights = req.body.rankingWeights;
        if (req.body.hiddenFeatures) {
            settings.hiddenFeatures = req.body.hiddenFeatures;
            settings.markModified('hiddenFeatures');
        }

        await settings.save();
        console.log('Settings saved successfully, current footerSections count:', 
            settings.homepage?.footerSections?.length || 0);
        console.log('Settings saved successfully, current socialLinks count:', 
            settings.homepage?.socialLinks?.length || 0);

        // Sanitize response data the same way as getSettings
        const safeSettings = settings.toObject ? settings.toObject() : { ...settings };
        if (safeSettings.logoUrl && !isImageUrl(safeSettings.logoUrl)) {
            safeSettings.logoUrl = safeSettings.faviconUrl || '';
        }

        // Sanitize top-level socialLinks (the object-style ones)
        safeSettings.socialLinks = {
            facebook: safeSettings.socialLinks?.facebook || '',
            twitter: safeSettings.socialLinks?.twitter || '',
            instagram: safeSettings.socialLinks?.instagram || '',
            linkedin: safeSettings.socialLinks?.linkedin || '',
            youtube: safeSettings.socialLinks?.youtube || '',
            whatsapp: safeSettings.socialLinks?.whatsapp || ''
        };

        res.status(200).json({ success: true, message: 'Settings updated successfully', data: safeSettings });
    } catch (error) {
        console.error('Error in updateSettings:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

