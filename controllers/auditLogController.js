const AdminAuditLog = require('../models/AdminAuditLog');
const User = require('../models/User');

// ==================== AUDIT LOG VIEWING ====================

// @desc    Get audit logs with filters
// @route   GET /api/admin/audit-logs
exports.getAuditLogs = async (req, res) => {
    try {
        const {
            adminId,
            action,
            targetType,
            startDate,
            endDate,
            page = 1,
            limit = 50,
            sortBy = '-createdAt'
        } = req.query;

        let query = {};

        // Filter by admin user
        if (adminId) {
            query.adminId = adminId;
        }

        // Filter by action
        if (action) {
            query.action = action;
        }

        // Filter by target type
        if (targetType) {
            query.targetType = targetType;
        }

        // Filter by date range
        if (startDate || endDate) {
            query.createdAt = {};
            if (startDate) query.createdAt.$gte = new Date(startDate);
            if (endDate) query.createdAt.$lte = new Date(endDate);
        }

        // Pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);

        // Build sort
        const sortObj = {};
        if (sortBy.startsWith('-')) {
            sortObj[sortBy.substring(1)] = -1;
        } else {
            sortObj[sortBy] = 1;
        }

        // Get logs
        const logs = await AdminAuditLog.find(query)
            .populate('adminId', 'name email')
            .sort(sortObj)
            .skip(skip)
            .limit(parseInt(limit));

        const total = await AdminAuditLog.countDocuments(query);

        res.json({
            success: true,
            logs,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// @desc    Get detailed audit log
// @route   GET /api/admin/audit-logs/:id
exports.getAuditLogDetail = async (req, res) => {
    try {
        const log = await AdminAuditLog.findById(req.params.id)
            .populate('adminId', 'name email role')
            .populate('changes.before._id', 'name')
            .populate('changes.after._id', 'name');

        if (!log) {
            return res.status(404).json({ success: false, msg: 'Audit log not found' });
        }

        res.json({ success: true, log });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// @desc    Get audit report by action
// @route   GET /api/admin/audit-logs/report/by-action
exports.getAuditReportByAction = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        let match = {};
        if (startDate || endDate) {
            match.createdAt = {};
            if (startDate) match.createdAt.$gte = new Date(startDate);
            if (endDate) match.createdAt.$lte = new Date(endDate);
        }

        const report = await AdminAuditLog.aggregate([
            { $match: match },
            {
                $group: {
                    _id: '$action',
                    count: { $sum: 1 },
                    lastOccurrence: { $max: '$createdAt' }
                }
            },
            { $sort: { count: -1 } }
        ]);

        res.json({ success: true, report });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// @desc    Get audit report by admin
// @route   GET /api/admin/audit-logs/report/by-admin
exports.getAuditReportByAdmin = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        let match = {};
        if (startDate || endDate) {
            match.createdAt = {};
            if (startDate) match.createdAt.$gte = new Date(startDate);
            if (endDate) match.createdAt.$lte = new Date(endDate);
        }

        const report = await AdminAuditLog.aggregate([
            { $match: match },
            {
                $group: {
                    _id: '$adminId',
                    actionCount: { $sum: 1 },
                    actions: { $push: '$action' },
                    lastAction: { $max: '$createdAt' }
                }
            },
            { $sort: { actionCount: -1 } }
        ]);

        // Populate admin names
        for (let item of report) {
            const admin = await User.findById(item._id).select('name email');
            item.adminName = admin ? admin.name : 'Unknown';
            item.adminEmail = admin ? admin.email : '';
        }

        res.json({ success: true, report });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// @desc    Get admin activity summary
// @route   GET /api/admin/audit-logs/admin/:adminId/summary
exports.getAdminActivitySummary = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        let query = { adminId: req.params.adminId };
        if (startDate || endDate) {
            query.createdAt = {};
            if (startDate) query.createdAt.$gte = new Date(startDate);
            if (endDate) query.createdAt.$lte = new Date(endDate);
        }

        const logs = await AdminAuditLog.find(query);

        // Count by action type
        const actionBreakdown = {};
        logs.forEach(log => {
            actionBreakdown[log.action] = (actionBreakdown[log.action] || 0) + 1;
        });

        // Count by target type
        const targetBreakdown = {};
        logs.forEach(log => {
            targetBreakdown[log.targetType] = (targetBreakdown[log.targetType] || 0) + 1;
        });

        res.json({
            success: true,
            summary: {
                totalActions: logs.length,
                actionBreakdown,
                targetBreakdown,
                failedActions: logs.filter(l => l.status === 'Failed').length,
                dateRange: {
                    from: startDate || 'N/A',
                    to: endDate || 'N/A'
                }
            }
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// @desc    Export audit logs to CSV
// @route   GET /api/admin/audit-logs/export/csv
exports.exportAuditLogsCsv = async (req, res) => {
    try {
        const { action, targetType, startDate, endDate } = req.query;

        let query = {};
        if (action) query.action = action;
        if (targetType) query.targetType = targetType;
        if (startDate || endDate) {
            query.createdAt = {};
            if (startDate) query.createdAt.$gte = new Date(startDate);
            if (endDate) query.createdAt.$lte = new Date(endDate);
        }

        const logs = await AdminAuditLog.find(query)
            .populate('adminId', 'name email')
            .sort({ createdAt: -1 });

        // Build CSV
        const csv = [
            ['Timestamp', 'Admin Name', 'Admin Email', 'Action', 'Target Type', 'Target ID', 'Status', 'IP Address', 'Notes'].join(','),
            ...logs.map(log => [
                log.createdAt.toISOString(),
                `"${(log.adminId?.name || 'Deleted User').replace(/"/g, '""')}"`,
                log.adminId?.email || 'N/A',
                log.action,
                log.targetType,
                log.targetId || 'N/A',
                log.status || 'success',
                log.ipAddress || 'N/A',
                `"${(log.notes || '').replace(/"/g, '""')}"`
            ].join(','))
        ].join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="audit_logs_export.csv"');
        res.send(csv);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};
