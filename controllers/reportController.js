const User = require('../models/User');
const Company = require('../models/Company');
const Transaction = require('../models/Transaction');
const Order = require('../models/Order');
const Lead = require('../models/Lead');
const Enquiry = require('../models/Enquiry');
const Review = require('../models/Review');
const AnalyticsEvent = require('../models/AnalyticsEvent');
const { Parser } = require('json2csv');
const pdfmake = require('pdfmake');
// const vfsFonts = require('pdfmake/build/vfs_fonts'); // Not needed for Node.js with local fonts


const path = require('path');
const fs = require('fs');

// Helpers for Date Filters
const getDateRange = (startDate, endDate) => {
    const start = startDate ? new Date(startDate) : new Date(new Date().setDate(new Date().getDate() - 30));
    const end = endDate ? new Date(endDate) : new Date();
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    return { start, end };
};

// pdfmake fonts
const fonts = {
    Roboto: {
        normal: path.join(__dirname, '../node_modules/pdfmake/fonts/Roboto/Roboto-Regular.ttf'),
        bold: path.join(__dirname, '../node_modules/pdfmake/fonts/Roboto/Roboto-Medium.ttf'),
        italics: path.join(__dirname, '../node_modules/pdfmake/fonts/Roboto/Roboto-Italic.ttf'),
        bolditalics: path.join(__dirname, '../node_modules/pdfmake/fonts/Roboto/Roboto-MediumItalic.ttf')
    }
};

// Setup fonts for the pdfmake instance
// pdfmake.setFonts(fonts);

// Ensure fonts directory exists or use a fallback
// const printer = new PdfPrinter(fonts); // In 0.3.x, pdfmake is already an instance


// @desc    Get User Growth Report
// @route   GET /api/reports/users
exports.getUserGrowthReport = async (req, res) => {
    try {
        const { start, end } = getDateRange(req.query.startDate, req.query.endDate);
        const format = req.query.format || 'json';

        const data = await User.aggregate([
            {
                $match: {
                    createdAt: { $gte: start, $lte: end }
                }
            },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                    registrations: { $sum: 1 },
                    verified: { $sum: { $cond: ["$isEmailVerified", 1, 0] } }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        if (format === 'csv') {
            const fields = ['_id', 'registrations', 'verified'];
            const json2csv = new Parser({ fields, rename: { _id: 'Date' } });
            const csv = json2csv.parse(data);
            res.header('Content-Type', 'text/csv');
            res.attachment(`user-growth-${Date.now()}.csv`);
            return res.send(csv);
        }

        res.json({ success: true, count: data.length, data });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, msg: 'Error generating report' });
    }
};

// @desc    Get Business Listing Report
// @route   GET /api/reports/listings
exports.getListingReport = async (req, res) => {
    try {
        const { start, end } = getDateRange(req.query.startDate, req.query.endDate);
        const format = req.query.format || 'json';

        const data = await Company.aggregate([
            {
                $match: {
                    createdAt: { $gte: start, $lte: end }
                }
            },
            {
                $group: {
                    _id: "$status",
                    count: { $sum: 1 },
                    claimed: { $sum: { $cond: ["$isClaimed", 1, 0] } }
                }
            }
        ]);

        if (format === 'csv') {
            const fields = ['_id', 'count', 'claimed'];
            const json2csv = new Parser({ fields });
            const csv = json2csv.parse(data);
            res.header('Content-Type', 'text/csv');
            res.attachment(`listing-report-${Date.now()}.csv`);
            return res.send(csv);
        }

        res.json({ success: true, data });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, msg: 'Error generating report' });
    }
};

// @desc    Get Revenue Report
// @route   GET /api/reports/revenue
exports.getRevenueReport = async (req, res) => {
    try {
        const { start, end } = getDateRange(req.query.startDate, req.query.endDate);
        const format = req.query.format || 'json';

        const data = await Transaction.aggregate([
            {
                $match: {
                    createdAt: { $gte: start, $lte: end },
                    status: 'Success'
                }
            },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                    amount: { $sum: "$amount" },
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        if (format === 'csv') {
            const fields = ['_id', 'amount', 'count'];
            const json2csv = new Parser({ fields });
            const csv = json2csv.parse(data);
            res.header('Content-Type', 'text/csv');
            res.attachment(`revenue-report-${Date.now()}.csv`);
            return res.send(csv);
        }

        res.json({ success: true, data });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, msg: 'Error generating report' });
    }
};

// @desc    Get Lead/Enquiry Volume Report
// @route   GET /api/reports/leads
exports.getLeadReport = async (req, res) => {
    try {
        const { start, end } = getDateRange(req.query.startDate, req.query.endDate);
        const format = req.query.format || 'json';

        const leadData = await Lead.aggregate([
            { $match: { createdAt: { $gte: start, $lte: end } } },
            { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, leads: { $sum: 1 } } }
        ]);

        const enquiryData = await Enquiry.aggregate([
            { $match: { createdAt: { $gte: start, $lte: end } } },
            { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, enquiries: { $sum: 1 } } }
        ]);

        // Merge data
        const merged = {};
        leadData.forEach(d => merged[d._id] = { date: d._id, leads: d.leads, enquiries: 0 });
        enquiryData.forEach(d => {
            if (merged[d._id]) merged[d._id].enquiries = d.enquiries;
            else merged[d._id] = { date: d._id, leads: 0, enquiries: d.enquiries };
        });

        const data = Object.values(merged).sort((a,b) => a.date.localeCompare(b.date));

        if (format === 'csv') {
            const fields = ['date', 'leads', 'enquiries'];
            const json2csv = new Parser({ fields });
            const csv = json2csv.parse(data);
            res.header('Content-Type', 'text/csv');
            res.attachment(`lead-enquiry-report-${Date.now()}.csv`);
            return res.send(csv);
        }

        res.json({ success: true, data });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, msg: 'Error generating report' });
    }
};

// @desc    Get Review Summary Report
// @route   GET /api/reports/reviews
exports.getReviewReport = async (req, res) => {
    try {
        const { start, end } = getDateRange(req.query.startDate, req.query.endDate);
        const format = req.query.format || 'json';

        const data = await Review.aggregate([
            { $match: { createdAt: { $gte: start, $lte: end } } },
            {
                $group: {
                    _id: "$rating",
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: -1 } }
        ]);

        if (format === 'csv') {
            const fields = ['_id', 'count'];
            const json2csv = new Parser({ fields });
            const csv = json2csv.parse(data);
            res.header('Content-Type', 'text/csv');
            res.attachment(`review-report-${Date.now()}.csv`);
            return res.send(csv);
        }

        res.json({ success: true, data });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, msg: 'Error generating report' });
    }
};

// @desc    Get Search Keywords Report
// @route   GET /api/reports/search-trends
exports.getSearchTrendsReport = async (req, res) => {
    try {
        const { start, end } = getDateRange(req.query.startDate, req.query.endDate);
        const limit = parseInt(req.query.limit) || 100;
        const format = req.query.format || 'json';

        const data = await AnalyticsEvent.getTopSearches(start, end, limit);

        if (format === 'csv') {
            const fields = ['query', 'count'];
            const json2csv = new Parser({ fields });
            const csv = json2csv.parse(data);
            res.header('Content-Type', 'text/csv');
            res.attachment(`search-trends-${Date.now()}.csv`);
            return res.send(csv);
        }

        res.json({ success: true, data });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, msg: 'Error generating report' });
    }
};
