const mongoose = require('mongoose');

const footerLinkSchema = new mongoose.Schema({
    label: String,
    url: String,
    type: { type: String, enum: ['internal', 'external'], default: 'internal' }
}, { _id: false });

const footerSectionSchema = new mongoose.Schema({
    id: String,
    title: String,
    links: [footerLinkSchema]
}, { _id: false });

const discoveryChipSchema = new mongoose.Schema({
    id: String,
    name: String,
    slug: String,
    icon: String,
    color: String
}, { _id: false });

const socialLinkSchema = new mongoose.Schema({
    platform: { type: String, enum: ['Instagram', 'Facebook', 'Linkedin', 'Youtube', 'Twitter', 'Whatsapp'] },
    url: String,
    icon: String
}, { _id: false });

const homepageSchema = new mongoose.Schema({
    showHero: { type: Boolean, default: true },
    showRecentlyViewed: { type: Boolean, default: true },
    showBanners: { type: Boolean, default: true },
    showCategories: { type: Boolean, default: true },
    showDiscovery: { type: Boolean, default: false },
    showAds: { type: Boolean, default: true },
    showFeatured: { type: Boolean, default: true },
    showPopular: { type: Boolean, default: true },
    showLatest: { type: Boolean, default: true },
    showReviews: { type: Boolean, default: true },
    showCTA: { type: Boolean, default: true },
    showMobileApp: { type: Boolean, default: true },
    showFooter: { type: Boolean, default: true },
    footerText: { type: String, default: '' },
    footerSections: [footerSectionSchema],
    heroTaglinePrefix: { type: String, default: "" },
    heroTaglineSuffix: { type: String, default: "" },
    countSource: { type: String, default: "dynamic" },
    fixedCount: { type: String, default: "" },
    searchPlaceholder: { type: String, default: "Search and discover businesses" },
    trendingSearches: [String],
    discoveryChips: { type: [discoveryChipSchema], default: [] },
    socialLinks: { type: [socialLinkSchema], default: [] }
}, { _id: false });

const settingSchema = new mongoose.Schema({
    siteName: { type: String, default: 'Engitech' },
    logoUrl: String,
    faviconUrl: String,
    primaryColor: { type: String, default: '#4f46e5' },
    secondaryColor: { type: String, default: '#f8fafc' },
    contactEmail: String,
    contactPhone: String,
    socialLinks: {
        facebook: { type: String, trim: true, default: '' },
        twitter: { type: String, trim: true, default: '' },
        instagram: { type: String, trim: true, default: '' },
        linkedin: { type: String, trim: true, default: '' },
        youtube: { type: String, trim: true, default: '' },
        whatsapp: { type: String, trim: true, default: '' }
    },
    footerText: { type: String, default: '' },
    homepage: { type: homepageSchema, default: () => ({}) },
    showFooter: { type: Boolean, default: true },
    rankingWeights: {
        reviews: { type: Number, default: 1.0 },
        distance: { type: Number, default: 1.0 },
        responseTime: { type: Number, default: 1.0 },
        premium: { type: Number, default: 1.5 }
    },
    hiddenFeatures: [String]
}, { timestamps: true });

module.exports = mongoose.model('Setting', settingSchema);
