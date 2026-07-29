const mongoose = require('mongoose');

const analyticsEventSchema = new mongoose.Schema({
    eventType: {
        type: String,
        required: true,
        enum: [
            'page_view',
            'search',
            'business_click',
            'enquiry_submit',
            'review_submit',
            'lead_generated',
            'subscription_purchase',
            'coupon_used',
            'user_registration',
            'business_listing_view',
            'category_browse',
            'location_search',
            'social_share',
            'contact_click',
            'direction_request',
            'photo_view',
            'video_play',
            'download_brochure',
            'call_click',
            'website_click',
            // Legacy events for backward compatibility
            'view',
            'call',
            'whatsapp',
            'enquiry'
        ]
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    sessionId: {
        type: String,
        required: true
    },
    businessId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company'
    },
    categoryId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Category'
    },
    locationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'City'
    },
    searchQuery: String,
    searchFilters: {
        category: String,
        location: String,
        priceRange: String,
        rating: Number
    },
    deviceInfo: {
        userAgent: String,
        ipAddress: String,
        deviceType: {
            type: String,
            enum: ['desktop', 'mobile', 'tablet', 'other'],
            default: 'other'
        },
        browser: String,
        os: String
    },
    referrer: String,
    url: String,
    timestamp: {
        type: Date,
        default: Date.now,
        index: true
    },
    metadata: {
        duration: Number, // page view duration in seconds
        scrollDepth: Number, // scroll depth percentage
        clickPosition: {
            x: Number,
            y: Number
        },
        elementClicked: String,
        conversionValue: Number, // monetary value for conversions
        campaignId: String,
        source: String,
        medium: String
    },
    // Legacy fields for backward compatibility
    event: String,
    city: String,
    device: String,
    source: String
}, { timestamps: true });

// Indexes for efficient queries
analyticsEventSchema.index({ eventType: 1, timestamp: -1 });
analyticsEventSchema.index({ userId: 1, timestamp: -1 });
analyticsEventSchema.index({ businessId: 1, timestamp: -1 });
analyticsEventSchema.index({ sessionId: 1 });
analyticsEventSchema.index({ 'deviceInfo.deviceType': 1 });
analyticsEventSchema.index({ timestamp: -1 });

// Pre-save middleware to handle legacy event mapping
analyticsEventSchema.pre('save', function(next) {
    // Map legacy events to new event types
    if (this.event && !this.eventType) {
        switch (this.event) {
            case 'view':
                this.eventType = 'business_listing_view';
                break;
            case 'call':
                this.eventType = 'call_click';
                break;
            case 'whatsapp':
                this.eventType = 'contact_click';
                break;
            case 'enquiry':
                this.eventType = 'enquiry_submit';
                break;
            default:
                this.eventType = this.event;
        }
    }

    // Map legacy device field
    if (this.device && !this.deviceInfo.deviceType) {
        this.deviceInfo.deviceType = this.device;
    }

    // Map legacy city field
    if (this.city && !this.locationId) {
        // This would need to be resolved to an actual location ID
        // For now, we'll store it in metadata
        if (!this.metadata) this.metadata = {};
        this.metadata.city = this.city;
    }

    next();
});

// Static methods for analytics queries
analyticsEventSchema.statics.getPageViews = function(startDate, endDate, filters = {}) {
    const query = {
        eventType: 'page_view',
        timestamp: { $gte: startDate, $lte: endDate }
    };

    if (filters.businessId) query.businessId = filters.businessId;
    if (filters.categoryId) query.categoryId = filters.categoryId;

    return this.aggregate([
        { $match: query },
        {
            $group: {
                _id: {
                    $dateToString: { format: '%Y-%m-%d', date: '$timestamp' }
                },
                count: { $sum: 1 },
                uniqueUsers: { $addToSet: '$userId' },
                avgDuration: { $avg: '$metadata.duration' }
            }
        },
        {
            $project: {
                date: '$_id',
                pageViews: '$count',
                uniqueVisitors: { $size: '$uniqueUsers' },
                avgDuration: { $round: ['$avgDuration', 2] }
            }
        },
        { $sort: { date: 1 } }
    ]);
};

analyticsEventSchema.statics.getTopSearches = function(startDate, endDate, limit = 10) {
    return this.aggregate([
        {
            $match: {
                eventType: 'search',
                timestamp: { $gte: startDate, $lte: endDate },
                searchQuery: { $exists: true, $ne: '' }
            }
        },
        {
            $group: {
                _id: { $toLower: '$searchQuery' },
                count: { $sum: 1 },
                originalQuery: { $first: '$searchQuery' }
            }
        },
        { $sort: { count: -1 } },
        { $limit: limit },
        {
            $project: {
                query: '$originalQuery',
                count: 1,
                _id: 0
            }
        }
    ]);
};

analyticsEventSchema.statics.getBusinessPerformance = function(startDate, endDate, businessId = null) {
    const matchQuery = {
        timestamp: { $gte: startDate, $lte: endDate }
    };

    if (businessId) matchQuery.businessId = businessId;

    return this.aggregate([
        { $match: matchQuery },
        {
            $group: {
                _id: '$businessId',
                views: {
                    $sum: {
                        $cond: [{ $eq: ['$eventType', 'business_listing_view'] }, 1, 0]
                    }
                },
                clicks: {
                    $sum: {
                        $cond: [{
                            $in: ['$eventType', ['call_click', 'website_click', 'contact_click', 'direction_request']]
                        }, 1, 0]
                    }
                },
                enquiries: {
                    $sum: {
                        $cond: [{ $eq: ['$eventType', 'enquiry_submit'] }, 1, 0]
                    }
                },
                reviews: {
                    $sum: {
                        $cond: [{ $eq: ['$eventType', 'review_submit'] }, 1, 0]
                    }
                },
                leads: {
                    $sum: {
                        $cond: [{ $eq: ['$eventType', 'lead_generated'] }, 1, 0]
                    }
                }
            }
        },
        {
            $lookup: {
                from: 'companies',
                localField: '_id',
                foreignField: '_id',
                as: 'business'
            }
        },
        {
            $unwind: { path: '$business', preserveNullAndEmptyArrays: true }
        },
        {
            $project: {
                businessId: '$_id',
                businessName: '$business.name',
                views: 1,
                clicks: 1,
                enquiries: 1,
                reviews: 1,
                leads: 1,
                ctr: {
                    $cond: {
                        if: { $gt: ['$views', 0] },
                        then: { $round: [{ $multiply: [{ $divide: ['$clicks', '$views'] }, 100] }, 2] },
                        else: 0
                    }
                }
            }
        },
        { $sort: { views: -1 } }
    ]);
};

analyticsEventSchema.statics.getRevenueAnalytics = function(startDate, endDate) {
    return this.aggregate([
        {
            $match: {
                eventType: { $in: ['subscription_purchase', 'coupon_used', 'lead_generated'] },
                timestamp: { $gte: startDate, $lte: endDate }
            }
        },
        {
            $group: {
                _id: {
                    type: '$eventType',
                    date: {
                        $dateToString: { format: '%Y-%m-%d', date: '$timestamp' }
                    }
                },
                count: { $sum: 1 },
                revenue: { $sum: '$metadata.conversionValue' }
            }
        },
        {
            $group: {
                _id: '$_id.date',
                subscriptions: {
                    $sum: {
                        $cond: [{ $eq: ['$_id.type', 'subscription_purchase'] }, '$count', 0]
                    }
                },
                subscriptionRevenue: {
                    $sum: {
                        $cond: [{ $eq: ['$_id.type', 'subscription_purchase'] }, '$revenue', 0]
                    }
                },
                coupons: {
                    $sum: {
                        $cond: [{ $eq: ['$_id.type', 'coupon_used'] }, '$count', 0]
                    }
                },
                couponRevenue: {
                    $sum: {
                        $cond: [{ $eq: ['$_id.type', 'coupon_used'] }, '$revenue', 0]
                    }
                },
                leads: {
                    $sum: {
                        $cond: [{ $eq: ['$_id.type', 'lead_generated'] }, '$count', 0]
                    }
                },
                leadRevenue: {
                    $sum: {
                        $cond: [{ $eq: ['$_id.type', 'lead_generated'] }, '$revenue', 0]
                    }
                }
            }
        },
        {
            $project: {
                date: '$_id',
                subscriptions: 1,
                subscriptionRevenue: 1,
                coupons: 1,
                couponRevenue: 1,
                leads: 1,
                leadRevenue: 1,
                totalRevenue: {
                    $add: ['$subscriptionRevenue', '$couponRevenue', '$leadRevenue']
                }
            }
        },
        { $sort: { date: 1 } }
    ]);
};

module.exports = mongoose.model('AnalyticsEvent', analyticsEventSchema);
