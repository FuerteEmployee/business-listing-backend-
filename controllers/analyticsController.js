const AnalyticsEvent = require('../models/AnalyticsEvent');
const Company = require('../models/Company');
const User = require('../models/User');
const Subscription = require('../models/Subscription');
const Enquiry = require('../models/Enquiry');
const Review = require('../models/Review');
const mongoose = require('mongoose');

// ==================== DASHBOARD OVERVIEW ====================

// Get main dashboard KPIs
const getDashboardKPIs = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const end = endDate ? new Date(endDate) : new Date();

        // Get total metrics
        const [
            totalUsers,
            totalBusinesses,
            totalEnquiries,
            totalReviews,
            activeSubscriptions
        ] = await Promise.all([
            User.countDocuments({ createdAt: { $gte: start, $lte: end } }),
            Company.countDocuments({ createdAt: { $gte: start, $lte: end } }),
            Enquiry.countDocuments({ createdAt: { $gte: start, $lte: end } }),
            Review.countDocuments({ createdAt: { $gte: start, $lte: end } }),
            Subscription.countDocuments({
                status: 'active',
                createdAt: { $gte: start, $lte: end }
            })
        ]);

        // Get analytics events
        const analyticsData = await AnalyticsEvent.aggregate([
            {
                $match: {
                    timestamp: { $gte: start, $lte: end }
                }
            },
            {
                $group: {
                    _id: null,
                    totalPageViews: {
                        $sum: { $cond: [{ $eq: ['$eventType', 'page_view'] }, 1, 0] }
                    },
                    totalSearches: {
                        $sum: { $cond: [{ $eq: ['$eventType', 'search'] }, 1, 0] }
                    },
                    totalBusinessViews: {
                        $sum: { $cond: [{ $eq: ['$eventType', 'business_listing_view'] }, 1, 0] }
                    },
                    totalClicks: {
                        $sum: {
                            $cond: [{
                                $in: ['$eventType', ['call_click', 'website_click', 'contact_click', 'direction_request']]
                            }, 1, 0]
                        }
                    },
                    totalEnquiries: {
                        $sum: { $cond: [{ $eq: ['$eventType', 'enquiry_submit'] }, 1, 0] }
                    },
                    totalLeads: {
                        $sum: { $cond: [{ $eq: ['$eventType', 'lead_generated'] }, 1, 0] }
                    },
                    uniqueUsers: { $addToSet: '$userId' }
                }
            }
        ]);

        const analytics = analyticsData[0] || {
            totalPageViews: 0,
            totalSearches: 0,
            totalBusinessViews: 0,
            totalClicks: 0,
            totalEnquiries: 0,
            totalLeads: 0,
            uniqueUsers: []
        };

        // Calculate conversion rates
        const ctr = analytics.totalBusinessViews > 0 ?
            ((analytics.totalClicks / analytics.totalBusinessViews) * 100).toFixed(2) : 0;

        const enquiryRate = analytics.totalBusinessViews > 0 ?
            ((analytics.totalEnquiries / analytics.totalBusinessViews) * 100).toFixed(2) : 0;

        res.json({
            success: true,
            kpis: {
                totalUsers,
                totalBusinesses,
                totalEnquiries,
                totalReviews,
                activeSubscriptions,
                totalPageViews: analytics.totalPageViews,
                totalSearches: analytics.totalSearches,
                totalBusinessViews: analytics.totalBusinessViews,
                totalClicks: analytics.totalClicks,
                totalLeads: analytics.totalLeads,
                uniqueVisitors: analytics.uniqueUsers.length,
                clickThroughRate: parseFloat(ctr),
                enquiryConversionRate: parseFloat(enquiryRate)
            },
            period: {
                start: start.toISOString(),
                end: end.toISOString()
            }
        });
    } catch (err) {
        console.error('Error fetching dashboard KPIs:', err);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// ==================== TRAFFIC ANALYTICS ====================

// Get traffic analytics (page views, unique visitors, etc.)
const getTrafficAnalytics = async (req, res) => {
    try {
        const { startDate, endDate, groupBy = 'day' } = req.query;

        const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const end = endDate ? new Date(endDate) : new Date();

        let groupFormat;
        switch (groupBy) {
            case 'hour':
                groupFormat = '%Y-%m-%d %H:00';
                break;
            case 'week':
                groupFormat = '%Y-W%V';
                break;
            case 'month':
                groupFormat = '%Y-%m';
                break;
            default:
                groupFormat = '%Y-%m-%d';
        }

        const trafficData = await AnalyticsEvent.aggregate([
            {
                $match: {
                    eventType: 'page_view',
                    timestamp: { $gte: start, $lte: end }
                }
            },
            {
                $group: {
                    _id: {
                        $dateToString: { format: groupFormat, date: '$timestamp' }
                    },
                    pageViews: { $sum: 1 },
                    uniqueUsers: { $addToSet: '$userId' },
                    sessions: { $addToSet: '$sessionId' },
                    avgDuration: { $avg: '$metadata.duration' },
                    bounceRate: {
                        $avg: {
                            $cond: [{ $lt: ['$metadata.duration', 30] }, 1, 0]
                        }
                    }
                }
            },
            {
                $project: {
                    period: '$_id',
                    pageViews: 1,
                    uniqueVisitors: { $size: '$uniqueUsers' },
                    sessions: { $size: '$sessions' },
                    avgDuration: { $round: ['$avgDuration', 2] },
                    bounceRate: { $round: [{ $multiply: ['$bounceRate', 100] }, 2] }
                }
            },
            { $sort: { period: 1 } }
        ]);

        // Get device breakdown
        const deviceBreakdown = await AnalyticsEvent.aggregate([
            {
                $match: {
                    eventType: 'page_view',
                    timestamp: { $gte: start, $lte: end },
                    'deviceInfo.deviceType': { $exists: true }
                }
            },
            {
                $group: {
                    _id: '$deviceInfo.deviceType',
                    count: { $sum: 1 }
                }
            },
            {
                $project: {
                    device: '$_id',
                    count: 1,
                    percentage: { $round: [{ $multiply: [{ $divide: ['$count', { $sum: '$count' }] }, 100] }, 2] }
                }
            }
        ]);

        // Get top pages
        const topPages = await AnalyticsEvent.aggregate([
            {
                $match: {
                    eventType: 'page_view',
                    timestamp: { $gte: start, $lte: end },
                    url: { $exists: true }
                }
            },
            {
                $group: {
                    _id: '$url',
                    views: { $sum: 1 },
                    uniqueUsers: { $addToSet: '$userId' }
                }
            },
            {
                $project: {
                    url: '$_id',
                    views: 1,
                    uniqueVisitors: { $size: '$uniqueUsers' }
                }
            },
            { $sort: { views: -1 } },
            { $limit: 10 }
        ]);

        res.json({
            success: true,
            traffic: {
                timeline: trafficData,
                deviceBreakdown,
                topPages
            },
            period: {
                start: start.toISOString(),
                end: end.toISOString(),
                groupBy
            }
        });
    } catch (err) {
        console.error('Error fetching traffic analytics:', err);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// ==================== SEARCH INTELLIGENCE ====================

// Get search analytics
const getSearchAnalytics = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const end = endDate ? new Date(endDate) : new Date();

        // Get top search queries
        const topSearches = await AnalyticsEvent.getTopSearches(start, end, 20);

        // Get search trends over time
        const searchTrends = await AnalyticsEvent.aggregate([
            {
                $match: {
                    eventType: 'search',
                    timestamp: { $gte: start, $lte: end }
                }
            },
            {
                $group: {
                    _id: {
                        $dateToString: { format: '%Y-%m-%d', date: '$timestamp' }
                    },
                    searches: { $sum: 1 },
                    uniqueQueries: { $addToSet: '$searchQuery' }
                }
            },
            {
                $project: {
                    date: '$_id',
                    searches: 1,
                    uniqueQueries: { $size: '$uniqueQueries' }
                }
            },
            { $sort: { date: 1 } }
        ]);

        // Get search filters usage
        const filterUsage = await AnalyticsEvent.aggregate([
            {
                $match: {
                    eventType: 'search',
                    timestamp: { $gte: start, $lte: end },
                    searchFilters: { $exists: true }
                }
            },
            {
                $group: {
                    _id: null,
                    categoryFilters: {
                        $sum: { $cond: [{ $ne: ['$searchFilters.category', null] }, 1, 0] }
                    },
                    locationFilters: {
                        $sum: { $cond: [{ $ne: ['$searchFilters.location', null] }, 1, 0] }
                    },
                    priceFilters: {
                        $sum: { $cond: [{ $ne: ['$searchFilters.priceRange', null] }, 1, 0] }
                    },
                    ratingFilters: {
                        $sum: { $cond: [{ $ne: ['$searchFilters.rating', null] }, 1, 0] }
                    }
                }
            }
        ]);

        res.json({
            success: true,
            search: {
                topSearches,
                trends: searchTrends,
                filterUsage: filterUsage[0] || {}
            },
            period: {
                start: start.toISOString(),
                end: end.toISOString()
            }
        });
    } catch (err) {
        console.error('Error fetching search analytics:', err);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// ==================== BUSINESS PERFORMANCE ====================

// Get business performance analytics
const getBusinessPerformance = async (req, res) => {
    try {
        const { startDate, endDate, businessId, limit = 50 } = req.query;

        const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const end = endDate ? new Date(endDate) : new Date();

        const performanceData = await AnalyticsEvent.getBusinessPerformance(start, end, businessId);

        // Limit results if specified
        const limitedData = limit ? performanceData.slice(0, parseInt(limit)) : performanceData;

        res.json({
            success: true,
            businesses: limitedData,
            period: {
                start: start.toISOString(),
                end: end.toISOString()
            }
        });
    } catch (err) {
        console.error('Error fetching business performance:', err);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// Get detailed business analytics
const getBusinessAnalytics = async (req, res) => {
    try {
        const { businessId, startDate, endDate } = req.params;

        const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const end = endDate ? new Date(endDate) : new Date();

        // Get business details
        const business = await Company.findById(businessId);
        if (!business) {
            return res.status(404).json({ success: false, msg: 'Business not found' });
        }

        // Get performance metrics
        const performance = await AnalyticsEvent.aggregate([
            {
                $match: {
                    businessId: mongoose.Types.ObjectId(businessId),
                    timestamp: { $gte: start, $lte: end }
                }
            },
            {
                $group: {
                    _id: null,
                    views: {
                        $sum: { $cond: [{ $eq: ['$eventType', 'business_listing_view'] }, 1, 0] }
                    },
                    calls: {
                        $sum: { $cond: [{ $eq: ['$eventType', 'call_click'] }, 1, 0] }
                    },
                    websiteClicks: {
                        $sum: { $cond: [{ $eq: ['$eventType', 'website_click'] }, 1, 0] }
                    },
                    directions: {
                        $sum: { $cond: [{ $eq: ['$eventType', 'direction_request'] }, 1, 0] }
                    },
                    enquiries: {
                        $sum: { $cond: [{ $eq: ['$eventType', 'enquiry_submit'] }, 1, 0] }
                    },
                    reviews: {
                        $sum: { $cond: [{ $eq: ['$eventType', 'review_submit'] }, 1, 0] }
                    },
                    shares: {
                        $sum: { $cond: [{ $eq: ['$eventType', 'social_share'] }, 1, 0] }
                    },
                    photoViews: {
                        $sum: { $cond: [{ $eq: ['$eventType', 'photo_view'] }, 1, 0] }
                    }
                }
            }
        ]);

        // Get daily trends
        const dailyTrends = await AnalyticsEvent.aggregate([
            {
                $match: {
                    businessId: mongoose.Types.ObjectId(businessId),
                    timestamp: { $gte: start, $lte: end }
                }
            },
            {
                $group: {
                    _id: {
                        $dateToString: { format: '%Y-%m-%d', date: '$timestamp' }
                    },
                    views: {
                        $sum: { $cond: [{ $eq: ['$eventType', 'business_listing_view'] }, 1, 0] }
                    },
                    clicks: {
                        $sum: {
                            $cond: [{
                                $in: ['$eventType', ['call_click', 'website_click', 'contact_click', 'direction_request']]
                            }, 1, 0]
                        }
                    },
                    enquiries: {
                        $sum: { $cond: [{ $eq: ['$eventType', 'enquiry_submit'] }, 1, 0] }
                    }
                }
            },
            {
                $project: {
                    date: '$_id',
                    views: 1,
                    clicks: 1,
                    enquiries: 1
                }
            },
            { $sort: { date: 1 } }
        ]);

        const metrics = performance[0] || {
            views: 0,
            calls: 0,
            websiteClicks: 0,
            directions: 0,
            enquiries: 0,
            reviews: 0,
            shares: 0,
            photoViews: 0
        };

        // Calculate rates
        const ctr = metrics.views > 0 ? ((metrics.calls + metrics.websiteClicks) / metrics.views * 100).toFixed(2) : 0;
        const enquiryRate = metrics.views > 0 ? (metrics.enquiries / metrics.views * 100).toFixed(2) : 0;

        res.json({
            success: true,
            business: {
                id: business._id,
                name: business.name,
                category: business.category,
                location: business.city
            },
            metrics: {
                ...metrics,
                clickThroughRate: parseFloat(ctr),
                enquiryConversionRate: parseFloat(enquiryRate)
            },
            trends: dailyTrends,
            period: {
                start: start.toISOString(),
                end: end.toISOString()
            }
        });
    } catch (err) {
        console.error('Error fetching business analytics:', err);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// ==================== REVENUE ANALYTICS ====================

// Get revenue analytics
const getRevenueAnalytics = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const end = endDate ? new Date(endDate) : new Date();

        const revenueData = await AnalyticsEvent.getRevenueAnalytics(start, end);

        // Get subscription breakdown
        const subscriptionBreakdown = await Subscription.aggregate([
            {
                $match: {
                    createdAt: { $gte: start, $lte: end },
                    status: 'active'
                }
            },
            {
                $group: {
                    _id: '$planId',
                    count: { $sum: 1 },
                    revenue: { $sum: '$amount' }
                }
            },
            {
                $lookup: {
                    from: 'plans',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'plan'
                }
            },
            {
                $unwind: '$plan'
            },
            {
                $project: {
                    planName: '$plan.name',
                    count: 1,
                    revenue: 1
                }
            }
        ]);

        // Calculate totals
        const totals = revenueData.reduce((acc, day) => ({
            subscriptions: acc.subscriptions + day.subscriptions,
            subscriptionRevenue: acc.subscriptionRevenue + day.subscriptionRevenue,
            coupons: acc.coupons + day.coupons,
            couponRevenue: acc.couponRevenue + day.couponRevenue,
            leads: acc.leads + day.leads,
            leadRevenue: acc.leadRevenue + day.leadRevenue,
            totalRevenue: acc.totalRevenue + day.totalRevenue
        }), {
            subscriptions: 0,
            subscriptionRevenue: 0,
            coupons: 0,
            couponRevenue: 0,
            leads: 0,
            leadRevenue: 0,
            totalRevenue: 0
        });

        res.json({
            success: true,
            revenue: {
                timeline: revenueData,
                breakdown: subscriptionBreakdown,
                totals
            },
            period: {
                start: start.toISOString(),
                end: end.toISOString()
            }
        });
    } catch (err) {
        console.error('Error fetching revenue analytics:', err);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// ==================== USER BEHAVIOR ====================

// Get user behavior analytics
const getUserBehaviorAnalytics = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const end = endDate ? new Date(endDate) : new Date();

        // Get user journey analysis
        const userJourneys = await AnalyticsEvent.aggregate([
            {
                $match: {
                    userId: { $exists: true, $ne: null },
                    timestamp: { $gte: start, $lte: end }
                }
            },
            {
                $sort: { userId: 1, timestamp: 1 }
            },
            {
                $group: {
                    _id: '$userId',
                    events: {
                        $push: {
                            type: '$eventType',
                            timestamp: '$timestamp',
                            url: '$url'
                        }
                    },
                    sessionCount: { $addToSet: '$sessionId' }
                }
            },
            {
                $project: {
                    userId: '$_id',
                    eventCount: { $size: '$events' },
                    sessionCount: { $size: '$sessionCount' },
                    firstEvent: { $arrayElemAt: ['$events', 0] },
                    lastEvent: { $arrayElemAt: ['$events', -1] },
                    topEventTypes: {
                        $slice: [
                            {
                                $map: {
                                    input: { $setUnion: ['$events.type'] },
                                    as: 'type',
                                    in: {
                                        type: '$$type',
                                        count: {
                                            $size: {
                                                $filter: {
                                                    input: '$events',
                                                    cond: { $eq: ['$$this.type', '$$type'] }
                                                }
                                            }
                                        }
                                    }
                                }
                            },
                            5
                        ]
                    }
                }
            },
            { $sort: { eventCount: -1 } },
            { $limit: 100 }
        ]);

        // Get conversion funnel
        const funnelData = await AnalyticsEvent.aggregate([
            {
                $match: {
                    timestamp: { $gte: start, $lte: end }
                }
            },
            {
                $group: {
                    _id: '$sessionId',
                    hasSearch: {
                        $max: { $cond: [{ $eq: ['$eventType', 'search'] }, 1, 0] }
                    },
                    hasView: {
                        $max: { $cond: [{ $eq: ['$eventType', 'business_listing_view'] }, 1, 0] }
                    },
                    hasClick: {
                        $max: {
                            $cond: [{
                                $in: ['$eventType', ['call_click', 'website_click', 'contact_click']]
                            }, 1, 0]
                        }
                    },
                    hasEnquiry: {
                        $max: { $cond: [{ $eq: ['$eventType', 'enquiry_submit'] }, 1, 0] }
                    }
                }
            },
            {
                $group: {
                    _id: null,
                    searches: { $sum: '$hasSearch' },
                    views: { $sum: '$hasView' },
                    clicks: { $sum: '$hasClick' },
                    enquiries: { $sum: '$hasEnquiry' }
                }
            }
        ]);

        res.json({
            success: true,
            behavior: {
                userJourneys,
                conversionFunnel: funnelData[0] || {
                    searches: 0,
                    views: 0,
                    clicks: 0,
                    enquiries: 0
                }
            },
            period: {
                start: start.toISOString(),
                end: end.toISOString()
            }
        });
    } catch (err) {
        console.error('Error fetching user behavior analytics:', err);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// ==================== EXPORT ANALYTICS ====================

// Export analytics data
const exportAnalytics = async (req, res) => {
    try {
        const { type, startDate, endDate, format = 'json' } = req.query;

        const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const end = endDate ? new Date(endDate) : new Date();

        let data;

        switch (type) {
            case 'traffic':
                data = await AnalyticsEvent.getPageViews(start, end);
                break;
            case 'searches':
                data = await AnalyticsEvent.getTopSearches(start, end, 100);
                break;
            case 'businesses':
                data = await AnalyticsEvent.getBusinessPerformance(start, end);
                break;
            case 'revenue':
                data = await AnalyticsEvent.getRevenueAnalytics(start, end);
                break;
            default:
                return res.status(400).json({ success: false, msg: 'Invalid export type' });
        }

        if (format === 'csv') {
            // Convert to CSV
            const csvData = Array.isArray(data) ? data : [data];
            if (csvData.length === 0) {
                return res.status(404).json({ success: false, msg: 'No data to export' });
            }

            const headers = Object.keys(csvData[0]);
            const csvContent = [
                headers.join(','),
                ...csvData.map(row => headers.map(header => JSON.stringify(row[header] || '')).join(','))
            ].join('\n');

            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename=${type}-analytics.csv`);
            res.send(csvContent);
        } else {
            res.json({
                success: true,
                data,
                metadata: {
                    type,
                    period: { start: start.toISOString(), end: end.toISOString() },
                    exportedAt: new Date().toISOString()
                }
            });
        }
    } catch (err) {
        console.error('Error exporting analytics:', err);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// ==================== LEGACY FUNCTIONS ====================

// @desc    Log an analytics event (legacy)
// @route   POST /api/analytics/log
// @access  Public
const logEvent = async (req, res) => {
    try {
        const { event, businessId, city, device, source, sessionId } = req.body;

        const eventData = {
            eventType: event || 'view',
            userId: req.user ? req.user._id : null,
            sessionId: sessionId || req.ip || 'anonymous-session',
            city,
            deviceInfo: device ? { deviceType: device } : {},
            source,
            metadata: {
                city,
                source
            }
        };

        // Only attach businessId if it's a valid ObjectId
        if (businessId && mongoose.Types.ObjectId.isValid(businessId)) {
            eventData.businessId = businessId;
        }

        const analyticsEvent = new AnalyticsEvent(eventData);

        await analyticsEvent.save();
        res.status(201).json({ success: true });
    } catch (err) {
        console.error('Analytics Log Error:', err.message);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// @desc    Get aggregate analytics for all businesses owned by a merchant
// @route   GET /api/analytics/merchant/overview
// @access  Private (Merchant)
const getMerchantAnalyticsOverview = async (req, res) => {
    try {
        const companies = await Company.find({ owner: req.user.id }).select('_id');
        const companyIds = companies.map(c => c._id);

        if (companyIds.length === 0) {
            return res.json({
                success: true,
                kpis: { views: 0, calls: 0, enquiries: 0, whatsapp: 0 },
                trends: []
            });
        }

        const stats = await AnalyticsEvent.aggregate([
            {
                $match: {
                    businessId: { $in: companyIds },
                    timestamp: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
                }
            },
            {
                $group: {
                    _id: null,
                    views: { $sum: { $cond: [{ $eq: ['$eventType', 'business_listing_view'] }, 1, 0] } },
                    calls: { $sum: { $cond: [{ $eq: ['$eventType', 'call_click'] }, 1, 0] } },
                    enquiries: { $sum: { $cond: [{ $eq: ['$eventType', 'enquiry_submit'] }, 1, 0] } },
                    whatsapp: { $sum: { $cond: [{ $eq: ['$eventType', 'contact_click'] }, 1, 0] } }
                }
            }
        ]);

        const dailyTrends = await AnalyticsEvent.aggregate([
            {
                $match: {
                    businessId: { $in: companyIds },
                    timestamp: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
                }
            },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
                    views: { $sum: { $cond: [{ $eq: ['$eventType', 'business_listing_view'] }, 1, 0] } },
                    conversions: { $sum: { $cond: [{ $in: ['$eventType', ['call_click', 'enquiry_submit', 'contact_click']] }, 1, 0] } }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        res.json({
            success: true,
            kpis: stats[0] || { views: 0, calls: 0, enquiries: 0, whatsapp: 0 },
            trends: dailyTrends
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ success: false, msg: 'Server Error' });
    }
};

// @desc    Get detailed business analytics for merchant dashboard
// @route   GET /api/analytics/merchant/business/:businessId
// @access  Private (Merchant)
const getBusinessAnalyticsDetailed = async (req, res) => {
    try {
        const { businessId } = req.params;
        const start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        
        const business = await Company.findById(businessId);
        if (!business) return res.status(404).json({ success: false, msg: 'Business not found' });

        // Ensure ownership
        if (business.owner.toString() !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, msg: 'Not authorized' });
        }

        // 1. Device Breakdown
        const deviceData = await AnalyticsEvent.aggregate([
            { $match: { businessId: mongoose.Types.ObjectId(businessId), timestamp: { $gte: start } } },
            { $group: { _id: '$deviceInfo.deviceType', count: { $sum: 1 } } }
        ]);

        // 2. Rating Trend (Average rating over time)
        const ratingTrend = await Review.aggregate([
            { $match: { businessId: mongoose.Types.ObjectId(businessId), isDeleted: { $ne: true } } },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                    avgRating: { $avg: '$rating' },
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        // 3. Search Keywords
        const keywordStats = await AnalyticsEvent.aggregate([
            {
                $match: {
                    businessId: mongoose.Types.ObjectId(businessId),
                    eventType: 'business_listing_view',
                    timestamp: { $gte: start }
                }
            },
            {
                $lookup: {
                    from: 'analyticsevents',
                    let: { sessId: '$sessionId', viewTime: '$timestamp' },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ['$sessionId', '$$sessId'] },
                                        { $eq: ['$eventType', 'search'] },
                                        { $lt: ['$timestamp', '$$viewTime'] }
                                    ]
                                }
                            }
                        },
                        { $sort: { timestamp: -1 } },
                        { $limit: 1 }
                    ],
                    as: 'referringSearch'
                }
            },
            { $unwind: '$referringSearch' },
            { $group: { _id: '$referringSearch.searchQuery', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 10 }
        ]);

        // 4. Competitor Benchmarking
        const competitorAvg = await AnalyticsEvent.aggregate([
            {
                $lookup: {
                    from: 'companies',
                    localField: 'businessId',
                    foreignField: '_id',
                    as: 'comp'
                }
            },
            { $unwind: '$comp' },
            { 
                $match: { 
                    'comp.category': business.category,
                    'comp.city': business.city,
                    timestamp: { $gte: start }
                } 
            },
            {
                $group: {
                    _id: '$businessId',
                    views: { $sum: { $cond: [{ $eq: ['$eventType', 'business_listing_view'] }, 1, 0] } },
                    conversions: { $sum: { $cond: [{ $in: ['$eventType', ['call_click', 'enquiry_submit', 'contact_click', 'whatsapp']] }, 1, 0] } }
                }
            },
            {
                $group: {
                    _id: null,
                    avgViews: { $avg: '$views' },
                    avgConversions: { $avg: '$conversions' }
                }
            }
        ]);

        // 5. Daily Trends
        const trends = await AnalyticsEvent.aggregate([
            { $match: { businessId: mongoose.Types.ObjectId(businessId), timestamp: { $gte: start } } },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
                    views: { $sum: { $cond: [{ $eq: ['$eventType', 'business_listing_view'] }, 1, 0] } },
                    conversions: { $sum: { $cond: [{ $in: ['$eventType', ['call_click', 'enquiry_submit', 'contact_click', 'whatsapp']] }, 1, 0] } }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        res.json({
            success: true,
            business: { name: business.name },
            deviceBreakdown: deviceData,
            ratingTrend,
            topKeywords: keywordStats,
            marketBenchmark: competitorAvg[0] || { avgViews: 0, avgConversions: 0 },
            trends
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ success: false, msg: 'Server Error' });
    }
};

module.exports = {
    getDashboardKPIs,
    getTrafficAnalytics,
    getSearchAnalytics,
    getBusinessPerformance,
    getBusinessAnalytics,
    getBusinessAnalyticsDetailed,
    getMerchantAnalyticsOverview,
    getRevenueAnalytics,
    getUserBehaviorAnalytics,
    exportAnalytics,
    logEvent
};
