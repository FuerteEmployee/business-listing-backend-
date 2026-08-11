const mongoose = require('mongoose');
const User = require('../models/User');
const Company = require('../models/Company');
const Category = require('../models/Category');
const Product = require('../models/Product');
const Service = require('../models/Service');
const BrandLocation = require('../models/BrandLocation');
const Lead = require('../models/Lead');
const ClaimRequest = require('../models/ClaimRequest');
const Transaction = require('../models/Transaction');
const City = require('../models/City');
const RBACRole = require('../models/RBACRole');
const { isBrandScoped } = require('../middleware/authMiddleware');

const KPI_WINDOW_DAYS = 30;
const TIMELINE_RANGES = { '7D': 7, '30D': 30, '90D': 90 };
const DEFAULT_TIMELINE_DAYS = 7;

const getStartOfUtcDay = (daysAgo = 0) => {
    const date = new Date();
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() - daysAgo);
    return date;
};

const getUtcDateKey = (date) => {
    return date.toISOString().slice(0, 10);
};

// Returns null when the previous window has no data to compare against: growth from a
// zero baseline is undefined, and reporting it as "+100%" reads as a real trend.
// The frontend renders null as "N/A".
const getPercentChange = (currentValue, previousValue) => {
    if (!previousValue) {
        return null;
    }

    return Number((((currentValue - previousValue) / previousValue) * 100).toFixed(1));
};

const aggregateDailyCounts = async (Model, match, startDate) => {
    const rows = await Model.aggregate([
        {
            $match: {
                ...match,
                createdAt: { $gte: startDate }
            }
        },
        {
            $group: {
                _id: {
                    $dateToString: {
                        format: '%Y-%m-%d',
                        date: '$createdAt',
                        timezone: 'UTC'
                    }
                },
                count: { $sum: 1 }
            }
        },
        { $sort: { _id: 1 } }
    ]);

    return rows.reduce((accumulator, row) => {
        accumulator[row._id] = row.count;
        return accumulator;
    }, {});
};

// @desc    Get dashboard statistics
// @route   GET /api/dashboard/stats
const getDashboardStats = async (req, res) => {
    try {
        const isBrandOwner = isBrandScoped(req.user);
        let companyQuery = {};
        let productQuery = {};
        let serviceQuery = {};
        let locationQuery = {};
        let categoryQuery = { status: 'Active' };
        let leadQuery = {};
        const roles = await RBACRole.find().select('name');
        const adminRoleNames = roles.map(r => r.name);
        
        const adminQuery = { role: { $in: adminRoleNames } };
        const timelineDays = TIMELINE_RANGES[req.query.range] || DEFAULT_TIMELINE_DAYS;
        const currentWindowStart = getStartOfUtcDay(KPI_WINDOW_DAYS - 1);
        const previousWindowStart = getStartOfUtcDay((KPI_WINDOW_DAYS * 2) - 1);
        const timelineStart = getStartOfUtcDay(timelineDays - 1);

        const currentWindowFilter = { createdAt: { $gte: currentWindowStart } };
        const previousWindowFilter = {
            createdAt: {
                $gte: previousWindowStart,
                $lt: currentWindowStart
            }
        };

        if (isBrandOwner) {
            const brandIds = req.ownedBrandIds || [];
            companyQuery = { owner: req.user._id };
            productQuery = { listingId: { $in: brandIds } };
            serviceQuery = { listingId: { $in: brandIds } };
            locationQuery = { brandId: { $in: brandIds } };
            categoryQuery = { ...categoryQuery, brandId: { $in: brandIds } };
            leadQuery = { assignedTo: req.user._id };
        }

        const [
            totalUsers, 
            totalCompanies, 
            activeCategories, 
            pendingClaims, 
            totalProducts, 
            totalServices, 
            totalBrandLocations,
            leadStats,
            merchantStats,
            categoryStats,
            recentActivity,
            currentCompanies,
            previousCompanies,
            currentUsers,
            previousUsers,
            currentLeads,
            previousLeads,
            currentPendingClaims,
            previousPendingClaims,
            companiesTimeline,
            usersTimeline,
            leadsTimeline,
            claimsTimeline,
            adminTeam,
            adminTeamCount,
            totalRevenue,
            currentRevenue,
            previousRevenue,
            leadsToday,
            leadsYesterday,
            listingsStatus,
            pendingModerationListings,
            topCities,
            revenueTimeline
        ] = await Promise.all([
            User.countDocuments(),
            Company.countDocuments(companyQuery),
            Category.countDocuments(categoryQuery),
            ClaimRequest.countDocuments({ status: 'Pending' }),
            Product.countDocuments(productQuery),
            Service.countDocuments(serviceQuery),
            BrandLocation.countDocuments(locationQuery),
            
            // Lead Status Distribution
            Lead.aggregate([
                { $match: leadQuery },
                { $group: { _id: "$status", count: { $sum: 1 } } }
            ]),

            // Merchant Status Distribution (Admin only)
            !isBrandOwner ? User.aggregate([
                { $match: { role: 'Merchant' } },
                { $group: { _id: "$status", count: { $sum: 1 } } }
            ]) : Promise.resolve([]),

            // Top Categories by Listing Count.
            // Grouped on the category_id ref and resolved through the categories collection,
            // mirroring topCities below. The legacy free-text `category` string this used to
            // group on is unvalidated, so bad imports (company names written into it) surfaced
            // as fake "sectors" in the chart.
            Company.aggregate([
                { $match: { ...companyQuery, category_id: { $ne: null } } },
                { $group: { _id: "$category_id", count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                { $limit: 5 },
                {
                    $lookup: {
                        from: 'categories',
                        localField: '_id',
                        foreignField: '_id',
                        as: 'categoryInfo'
                    }
                },
                { $unwind: '$categoryInfo' },
                {
                    $project: {
                        _id: '$categoryInfo.name',
                        count: 1
                    }
                }
            ]),

            // Recent Activity (derived from multiple collections) - Increased to 20
            Promise.all([
                Lead.find(leadQuery).sort({ createdAt: -1 }).limit(10).select('name category source createdAt'),
                ClaimRequest.find().sort({ createdAt: -1 }).limit(5).select('fullName businessEmail status createdAt'),
                User.find().sort({ createdAt: -1 }).limit(5).select('name role createdAt'),
                Company.find(companyQuery).sort({ createdAt: -1 }).limit(5).select('name status createdAt')
            ]).then(([leads, claims, users, companies]) => {
                const activities = [
                    ...leads.map(l => ({ type: 'lead', title: `New Lead: ${l.name}`, detail: l.category, time: l.createdAt })),
                    ...claims.map(c => ({ type: 'claim', title: `Claim: ${c.fullName}`, detail: c.status, time: c.createdAt })),
                    ...users.map(u => ({ type: 'user', title: `Joined: ${u.name}`, detail: u.role, time: u.createdAt })),
                    ...companies.map(c => ({ type: 'company', title: `Listing: ${c.name}`, detail: c.status, time: c.createdAt }))
                ];
                return activities.sort((a, b) => b.time - a.time).slice(0, 20);
            }),

            Company.countDocuments({ ...companyQuery, ...currentWindowFilter }),
            Company.countDocuments({ ...companyQuery, ...previousWindowFilter }),
            !isBrandOwner ? User.countDocuments(currentWindowFilter) : Promise.resolve(0),
            !isBrandOwner ? User.countDocuments(previousWindowFilter) : Promise.resolve(0),
            Lead.countDocuments({ ...leadQuery, ...currentWindowFilter }),
            Lead.countDocuments({ ...leadQuery, ...previousWindowFilter }),
            ClaimRequest.countDocuments({ status: 'Pending', ...currentWindowFilter }),
            ClaimRequest.countDocuments({ status: 'Pending', ...previousWindowFilter }),
            aggregateDailyCounts(Company, companyQuery, timelineStart),
            !isBrandOwner ? aggregateDailyCounts(User, {}, timelineStart) : Promise.resolve({}),
            aggregateDailyCounts(Lead, leadQuery, timelineStart),
            aggregateDailyCounts(ClaimRequest, { status: 'Pending' }, timelineStart),
            !isBrandOwner
                ? User.find(adminQuery)
                    .sort({ createdAt: -1 })
                    .limit(4)
                    .select('name role')
                    .lean()
                : Promise.resolve([]),
            !isBrandOwner ? User.countDocuments(adminQuery) : Promise.resolve(0),

            // Total Revenue
            Transaction.aggregate([
                { $match: { status: 'success' } },
                { $group: { _id: null, total: { $sum: '$amount' } } }
            ]).then(res => res[0]?.total || 0),

            // Current Window Revenue
            Transaction.aggregate([
                { $match: { status: 'success', ...currentWindowFilter } },
                { $group: { _id: null, total: { $sum: '$amount' } } }
            ]).then(res => res[0]?.total || 0),

            // Previous Window Revenue
            Transaction.aggregate([
                { $match: { status: 'success', ...previousWindowFilter } },
                { $group: { _id: null, total: { $sum: '$amount' } } }
            ]).then(res => res[0]?.total || 0),

            // Leads Today
            Lead.countDocuments({
                ...leadQuery,
                createdAt: { $gte: getStartOfUtcDay(0) }
            }),

            // Leads Yesterday - baseline for the Leads Today trend badge
            Lead.countDocuments({
                ...leadQuery,
                createdAt: { $gte: getStartOfUtcDay(1), $lt: getStartOfUtcDay(0) }
            }),

            // Active vs Inactive Listings
            Company.aggregate([
                { $match: companyQuery },
                { $group: { _id: "$status", count: { $sum: 1 } } }
            ]),

            // Pending Moderation Listings
            Company.countDocuments({ status: 'Pending' }),

            // Top Cities (with lookup for names)
            Company.aggregate([
                { $match: { ...companyQuery, city_id: { $ne: null } } },
                { $group: { _id: "$city_id", count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                { $limit: 10 },
                {
                    $lookup: {
                        from: 'cities',
                        localField: '_id',
                        foreignField: '_id',
                        as: 'cityInfo'
                    }
                },
                { $unwind: '$cityInfo' },
                {
                    $project: {
                        _id: 1,
                        count: 1,
                        name: '$cityInfo.name'
                    }
                }
            ]),

            // Revenue Timeline
            Transaction.aggregate([
                {
                    $match: {
                        status: 'success',
                        createdAt: { $gte: timelineStart }
                    }
                },
                {
                    $group: {
                        _id: {
                            $dateToString: {
                                format: '%Y-%m-%d',
                                date: '$createdAt',
                                timezone: 'UTC'
                            }
                        },
                        amount: { $sum: '$amount' }
                    }
                },
                { $sort: { _id: 1 } }
            ]).then(rows => rows.reduce((acc, row) => {
                acc[row._id] = row.amount;
                return acc;
            }, {}))
        ]);

        const totalTrackedLeads = leadStats.reduce((sum, stage) => sum + stage.count, 0);
        const resolvedLeadStatuses = new Set(['Converted', 'Closed']);
        const resolvedLeads = leadStats.reduce((sum, stage) => {
            return resolvedLeadStatuses.has(stage._id) ? sum + stage.count : sum;
        }, 0);

        const pipelineSummary = {
            totalTrackedLeads,
            resolvedLeads,
            resolutionRate: totalTrackedLeads > 0
                ? Number(((resolvedLeads / totalTrackedLeads) * 100).toFixed(1))
                : 0
        };

        const timeline = Array.from({ length: timelineDays }, (_, index) => {
            const date = getStartOfUtcDay(timelineDays - 1 - index);
            const isoDate = getUtcDateKey(date);

            return {
                date: isoDate,
                // Weekday names repeat past a week, so longer ranges get a dated label instead.
                label: timelineDays <= 7
                    ? date.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })
                    : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }),
                listings: companiesTimeline[isoDate] || 0,
                users: usersTimeline[isoDate] || 0,
                leads: leadsTimeline[isoDate] || 0,
                pendingClaims: claimsTimeline[isoDate] || 0,
                revenue: revenueTimeline[isoDate] || 0
            };
        });

        // System Health Status
        const systemHealth = {
            api: 'Healthy',
            database: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected',
            queue: 'Online',
            uptime: Math.floor(process.uptime())
        };

        res.json({
            totalUsers: isBrandOwner ? null : totalUsers,
            totalCompanies,
            activeCategories,
            pendingClaims,
            totalProducts,
            totalServices,
            totalBrandLocations,
            totalRevenue,
            leadsToday,
            listingsStatus,
            pendingModerationListings,
            topCities,
            leadPipeline: leadStats,
            merchantHealth: merchantStats,
            topCategories: categoryStats,
            recentActivity,
            adminTeam,
            adminTeamCount,
            pipelineSummary,
            timeline,
            systemHealth,
            kpiTrends: {
                totalCompanies: getPercentChange(currentCompanies, previousCompanies),
                totalUsers: isBrandOwner ? null : getPercentChange(currentUsers, previousUsers),
                totalLeads: getPercentChange(currentLeads, previousLeads),
                leadsToday: getPercentChange(leadsToday, leadsYesterday),
                pendingClaims: getPercentChange(currentPendingClaims, previousPendingClaims),
                totalRevenue: getPercentChange(currentRevenue, previousRevenue)
            },
            generatedAt: new Date().toISOString()
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
};

module.exports = { getDashboardStats };
