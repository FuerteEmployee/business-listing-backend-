const mongoose = require('mongoose');
const slugify = require('slugify');

const companySchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    slug: {
        type: String,
        unique: true
    },
    category: {
        type: String, // Legacy support
        required: true
    },
    category_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Category',
        default: null
    },
    country_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Country',
        default: null
    },
    state_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'State',
        default: null
    },
    city_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'City',
        default: null
    },
    area_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Area',
        default: null
    },
    address: {
        type: String,
        trim: true
    },
    latitude: {
        type: Number,
        default: null
    },
    longitude: {
        type: Number,
        default: null
    },
    location: {
        type: {
            type: String,
            enum: ['Point'],
            default: 'Point'
        },
        coordinates: {
            type: [Number],
            default: [0, 0]
        }
    },
    description: {
        type: String,
        trim: true
    },
    phone: {
        type: String,
        trim: true
    },
    email: {
        type: String,
        trim: true,
        lowercase: true
    },
    website: {
        type: String,
        trim: true,
        lowercase: true
    },
    whatsapp: {
        type: String,
        trim: true
    },

    status: {
        type: String,
        enum: ['Pending', 'Approved', 'Rejected', 'Active', 'Inactive', 'Flagged', 'Suspended'],
        default: 'Pending'
    },
    // Approval workflow
    approvalStatus: {
        stage: {
            type: String,
            enum: ['AwaitingReview', 'UnderReview', 'MoreInfoRequested', 'Approved', 'Rejected'],
            default: 'AwaitingReview'
        },
        reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        reviewedAt: Date,
        rejectionReason: String,
        moreInfoRequestedAt: Date,
        moreInfoMessage: String
    },
    // Flagging & Spam Detection
    flags: [{
        reason: { type: String, enum: ['Spam', 'Inappropriate', 'Duplicate', 'Fake', 'Other'], required: true },
        description: String,
        flaggedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        flaggedAt: { type: Date, default: Date.now }
    }],
    isFlagged: {
        type: Boolean,
        default: false
    },
    // Suspension details
    suspensionDetails: {
        reason: String,
        suspendedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        suspendedAt: Date,
        notificationSent: Boolean
    },
    // Duplicate detection
    possibleDuplicates: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Company' }],
    mergedWith: { type: mongoose.Schema.Types.ObjectId, ref: 'Company' },
    // Claim verification
    claimVerification: {
        status: { type: String, enum: ['Pending', 'Verified', 'Rejected'], default: 'Pending' },
        documents: [String], // Cloudinary URLs
        uploadedAt: Date,
        verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        verifiedAt: Date
    },
    // Subscription plan
    plan: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Plan',
        default: null
    },
    // Business badge (blue tick)
    businessBadgeVerified: {
        type: Boolean,
        default: false
    },
    badgeVerifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    badgeVerifiedAt: Date,
    verified: {
        type: Boolean,
        default: false
    },
    verificationStatus: {
        type: String,
        enum: ['Verified', 'Not Verified', 'Pending Review', 'Flagged'],
        default: 'Not Verified'
    },
    image: {
        type: String,
        default: null
    },
    images: [
        {
            url: { type: String, required: true },
            isCover: { type: Boolean, default: false },
            order: { type: Number, default: 0 },
            status: { type: String, enum: ['Pending', 'Approved', 'Rejected'], default: 'Pending' }
        }
    ],
    videos: [
        {
            url: { type: String, required: true },
            platform: { type: String, enum: ['YouTube', 'Vimeo'], default: 'YouTube' }
        }
    ],
    logo: {
        type: String,
        default: null
    },
    coverPhotoUrl: {
        type: String,
        default: null
    },
    isClaimPending: {
        type: Boolean,
        default: false
    },
    claimed: {
        type: Boolean,
        default: false
    },
    owner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    isFeatured: {
        type: Boolean,
        default: false
    },
    rating: {
        type: Number,
        default: 0
    },
    reviewCount: {
        type: Number,
        default: 0
    },
    responseTime: {
        type: Number, // in minutes
        default: 30
    },
    manualRank: {
        type: Number,
        default: 0
    },
    businessHours: {
        monday: { open: String, close: String, closed: Boolean },
        tuesday: { open: String, close: String, closed: Boolean },
        wednesday: { open: String, close: String, closed: Boolean },
        thursday: { open: String, close: String, closed: Boolean },
        friday: { open: String, close: String, closed: Boolean },
        saturday: { open: String, close: String, closed: Boolean },
        sunday: { open: String, close: String, closed: Boolean }
    },
    priceRange: {
        type: String,
        enum: ['$', '$$', '$$$', '$$$$'],
        default: '$$'
    },
    tags: [String],
    ratingDistribution: {
        1: { type: Number, default: 0 },
        2: { type: Number, default: 0 },
        3: { type: Number, default: 0 },
        4: { type: Number, default: 0 },
        5: { type: Number, default: 0 }
    },
    // Merchant Onboarding & Compliance
    gstPan: {
        type: String,
        trim: true,
        default: null
    },
    subCategory: {
        type: String,
        trim: true,
        default: null
    },
    onboardingComplete: {
        type: Boolean,
        default: false
    },
    onboardingStep: {
        type: Number,
        default: 1
    },
    // Business Profile Details
    tagline: {
        type: String,
        trim: true,
        maxLength: 100
    },
    socialLinks: {
        facebook: { type: String, trim: true },
        instagram: { type: String, trim: true },
        twitter: { type: String, trim: true },
        linkedin: { type: String, trim: true },
        youtube: { type: String, trim: true }
    },
    bookingUrl: {
        type: String,
        trim: true
    },
    yearEstablished: {
        type: Number,
        min: 1900,
        max: new Date().getFullYear() + 1
    },
    employeeCount: {
        type: Number,
        min: 0
    },
    languages: [String],
    paymentMethods: [String],
    serviceRadius: {
        type: Number,
        default: 0 // in km
    },
    serviceArea: {
        type: {
            type: String,
            enum: ['Polygon'],
            default: 'Polygon'
        },
        coordinates: {
            type: [[[Number]]], // Array of arrays of [longitude, latitude]
            default: []
        }
    },
    favicon: {
        type: String,
        default: null
    },
    primaryColor: {
        type: String,
        default: '#4f46e5'
    },
    secondaryColor: {
        type: String,
        default: '#f8fafc'
    },
    footerText: {
        type: String,
        default: ''
    },
    changeHistory: [
        {
            field: String,
            oldValue: mongoose.Schema.Types.Mixed,
            newValue: mongoose.Schema.Types.Mixed,
            changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
            date: { type: Date, default: Date.now }
        }
    ]
}, { timestamps: true });

// Create slug from name before saving and ensure claimed status consistency
companySchema.pre('save', async function (next) {
    if (this.isModified('name') || (this.isNew && !this.slug)) {
        let baseSlug = slugify(this.name, { lower: true, strict: true });
        let generatedSlug = baseSlug;
        let suffix = 1;

        while (await mongoose.models.Company.findOne({ slug: generatedSlug, _id: { $ne: this._id } })) {
            generatedSlug = `${baseSlug}-${suffix++}`;
        }

        this.slug = generatedSlug;
    }
    
    // If owner is present, it MUST be claimed
    if (!this.owner) {
        this.claimed = false;
    } else {
        this.claimed = true;
    }
    
    // Sync location GeoJSON field
    if (typeof this.latitude === 'number' && typeof this.longitude === 'number') {
        this.location = {
            type: 'Point',
            coordinates: [this.longitude, this.latitude] // MongoDB uses [lng, lat]
        };
    }
    
    next();
});

// Index for Geospatial search
companySchema.index({ location: '2dsphere' });

module.exports = mongoose.model('Company', companySchema);
