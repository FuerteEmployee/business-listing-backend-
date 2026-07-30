const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true
    },
    password: {
        type: String,
        required: true,
        select: false // Ensure password isn't returned by default
    },
    mobileNumber: {
        type: String,
        unique: true,
        sparse: true, // Allow multiple nulls if not provided
        trim: true
    },
    otpVerified: {
        type: Boolean,
        default: false
    },
    isEmailVerified: {
        type: Boolean,
        default: false
    },
    verificationToken: String,
    resetPasswordToken: String,
    resetPasswordExpire: Date,
    role: {
        type: String,
        default: 'User'
    },
    status: {
        type: String,
        enum: ['Active', 'Suspended', 'Banned', 'Unverified'],
        default: 'Active'
    },
    parentAccount: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    company: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company',
        default: null
    },
    companyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company',
        default: null
    },
    banReason: String,
    banExpires: Date,
    banDuration: {
        type: String,
        enum: ['Temporary', 'Permanent'],
        default: null
    },
    // 2FA - Two Factor Authentication
    twoFactorEnabled: {
        type: Boolean,
        default: false
    },
    twoFactorSecret: {
        type: String,
        select: false
    },
    twoFactorMethod: {
        type: String,
        enum: ['TOTP', 'OTP'],
        default: null
    },
    // IP Whitelist for admin accounts
    ipWhitelist: [String],
    // Login history
    loginHistory: [
        {
            device: String,
            ip: String,
            userAgent: String,
            timestamp: { type: Date, default: Date.now }
        }
    ],
    // Company stats
    companiesOwned: {
        type: Number,
        default: 0
    },
    // Performance & reviews
    performanceScore: {
        type: Number,
        default: 100
    },
    reviewCount: {
        type: Number,
        default: 0
    },
    enquiryCount: {
        type: Number,
        default: 0
    },
    reportCount: {
        type: Number,
        default: 0
    },
    // Lead stats (for merchants)
    leadStats: {
        totalAssigned: { type: Number, default: 0 },
        totalConverted: { type: Number, default: 0 },
        avgResponseTime: { type: Number, default: 0 }
    },
    // Admin-related fields
    adminNotes: String,
    lastAdminAction: {
        action: String,
        by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        at: Date
    },
    // GDPR - Anonymisation
    isAnonymized: {
        type: Boolean,
        default: false
    },
    anonymizedAt: Date,
    // Profile photo
    profilePhoto: String,
    // Location
    location: String,
    // For impersonation logging
    impersonatedBy: {
        admin: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        at: Date,
        ipAddress: String
    },
    // For immediate session invalidation
    tokenVersion: {
        type: Number,
        default: 0
    },
    // Saved/Bookmarked Listings
    savedListings: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company'
    }],
    // Address Book
    addressBook: [{
        label: { type: String, default: 'Home' },
        address: String,
        isDefault: { type: Boolean, default: false }
    }],
    // Notification Preferences
    notificationPreferences: {
        email: { type: Boolean, default: true },
        sms: { type: Boolean, default: false },
        push: { type: Boolean, default: true },
        whatsapp: { type: Boolean, default: false },
        // Granular controls
        leads: {
            email: { type: Boolean, default: true },
            sms: { type: Boolean, default: true },
            push: { type: Boolean, default: true }
        },
        reviews: {
            email: { type: Boolean, default: true },
            sms: { type: Boolean, default: false },
            push: { type: Boolean, default: true }
        },
        renewals: {
            email: { type: Boolean, default: true },
            sms: { type: Boolean, default: true },
            push: { type: Boolean, default: true }
        },
        profileNudges: {
            email: { type: Boolean, default: true },
            sms: { type: Boolean, default: false },
            push: { type: Boolean, default: true }
        },
        weeklySummary: {
            email: { type: Boolean, default: true },
            sms: { type: Boolean, default: false },
            push: { type: Boolean, default: false }
        },
        digestFrequency: { 
            type: String, 
            enum: ['Daily', 'Weekly', 'Monthly', 'None'], 
            default: 'Weekly' 
        },
        lastDigestSent: { type: Date, default: null }
    },
    // Onboarding progress
    onboardingStatus: {
        isComplete: { type: Boolean, default: false },
        step: { type: Number, default: 1 },
        percentage: { type: Number, default: 0 },
        checklist: {
            basicInfo: { type: Boolean, default: false },
            locationSet: { type: Boolean, default: false },
            contactDetails: { type: Boolean, default: false },
            businessHours: { type: Boolean, default: false },
            mediaUploaded: { type: Boolean, default: false },
            verificationPending: { type: Boolean, default: true }
        }
    },
    // Privacy Settings
    privacySettings: {
        profileVisible: { type: Boolean, default: true },
        activityVisible: { type: Boolean, default: true }
    },
    // Device Push Token
    fcmToken: {
        type: String,
        default: null
    },
    googleId: {
        type: String,
        unique: true,
        sparse: true
    },
    facebookId: {
        type: String,
        unique: true,
        sparse: true
    }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
