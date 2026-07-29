const BroadcastTemplate = require('../models/BroadcastTemplate');
const Broadcast = require('../models/Broadcast');
const User = require('../models/User');
const sendEmail = require('../utils/email');
const { sendPushNotification } = require('../utils/push');
const { sendSMS, sendWhatsApp } = require('../utils/sms');
const AdminAuditLog = require('../models/AdminAuditLog');

// ==================== TEMPLATE MANAGEMENT ====================

exports.getTemplates = async (req, res) => {
    try {
        const templates = await BroadcastTemplate.find().sort({ createdAt: -1 });
        res.json({ success: true, templates });
    } catch (err) {
        res.status(500).json({ success: false, msg: 'Server Error' });
    }
};

exports.createTemplate = async (req, res) => {
    try {
        const template = await BroadcastTemplate.create({
            ...req.body,
            createdBy: req.user.id
        });
        res.status(201).json({ success: true, template });
    } catch (err) {
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

exports.updateTemplate = async (req, res) => {
    try {
        const template = await BroadcastTemplate.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json({ success: true, template });
    } catch (err) {
        res.status(500).json({ success: false, msg: 'Server Error' });
    }
};

exports.deleteTemplate = async (req, res) => {
    try {
        await BroadcastTemplate.findByIdAndDelete(req.params.id);
        res.json({ success: true, msg: 'Template removed' });
    } catch (err) {
        res.status(500).json({ success: false, msg: 'Server Error' });
    }
};

exports.deleteBroadcast = async (req, res) => {
    try {
        const broadcast = await Broadcast.findById(req.params.id);
        if (!broadcast) return res.status(404).json({ success: false, msg: 'Broadcast not found' });
        
        if (broadcast.status === 'Processing') {
            return res.status(400).json({ success: false, msg: 'Cannot delete a campaign in progress' });
        }

        await Broadcast.findByIdAndDelete(req.params.id);
        res.json({ success: true, msg: 'Campaign wiped from archives' });
    } catch (err) {
        res.status(500).json({ success: false, msg: 'Server Error' });
    }
};

exports.cloneBroadcast = async (req, res) => {
    try {
        const original = await Broadcast.findById(req.params.id);
        if (!original) return res.status(404).json({ success: false, msg: 'Source campaign not found' });

        const clone = await Broadcast.create({
            title: `${original.title} (Clone)`,
            templateId: original.templateId,
            channel: original.channel,
            targetType: original.targetType,
            segmentFilters: original.segmentFilters,
            manualTargets: original.manualTargets,
            status: 'Draft',
            createdBy: req.user.id
        });

        res.status(201).json({ success: true, broadcast: clone });
    } catch (err) {
        res.status(500).json({ success: false, msg: 'Server Error' });
    }
};

// ==================== BROADCAST MANAGEMENT ====================

exports.getBroadcasts = async (req, res) => {
    try {
        const broadcasts = await Broadcast.find()
            .populate('templateId', 'name')
            .sort({ createdAt: -1 });
        res.json({ success: true, broadcasts });
    } catch (err) {
        res.status(500).json({ success: false, msg: 'Server Error' });
    }
};

exports.createBroadcast = async (req, res) => {
    try {
        const broadcast = await Broadcast.create({
            ...req.body,
            status: 'Draft',
            createdBy: req.user.id
        });
        res.status(201).json({ success: true, broadcast });
    } catch (err) {
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

/**
 * Execute a broadcast immediately
 */
exports.executeBroadcast = async (req, res) => {
    try {
        const broadcast = await Broadcast.findById(req.params.id).populate('templateId');
        if (!broadcast) return res.status(404).json({ success: false, msg: 'Broadcast not found' });
        
        if (broadcast.status === 'Completed' || broadcast.status === 'Processing') {
            return res.status(400).json({ success: false, msg: 'Broadcast already processed or in progress' });
        }

        // Update status to processing
        broadcast.status = 'Processing';
        broadcast.startedAt = new Date();
        await broadcast.save();

        // 1. Identify Target Users
        let users = [];
        if (broadcast.targetType === 'All') {
            users = await User.find({ status: 'Active' });
        } else if (broadcast.targetType === 'Segment') {
            const query = { status: 'Active' };
            if (broadcast.segmentFilters.role) query.role = broadcast.segmentFilters.role;
            if (broadcast.segmentFilters.city) query.city = broadcast.segmentFilters.city;
            users = await User.find(query);
        } else {
            // Manual targets
            users = broadcast.manualTargets.map(t => ({ email: t, mobileNumber: t, name: 'Subscriber' }));
        }

        broadcast.stats.totalTargeted = users.length;
        await broadcast.save();

        // 2. Process Delivery (Async but we handle internal loop)
        // Note: For very large sets, this should be a background worker/job
        const processDelivery = async () => {
            let sentCount = 0;
            let failedCount = 0;

            for (const user of users) {
                try {
                    let result = { success: false };
                    
                    switch (broadcast.channel) {
                        case 'Email':
                            if (user.email) {
                                await sendEmail({
                                    email: user.email,
                                    subject: broadcast.templateId.subject || broadcast.title,
                                    message: broadcast.templateId.body.replace(/{{name}}/g, user.name || 'User'),
                                    html: broadcast.templateId.body.replace(/\n/g, '<br>').replace(/{{name}}/g, user.name || 'User')
                                });
                                result.success = true;
                            }
                            break;
                            
                        case 'Push':
                            // FCM tokens would be stored in user model
                            if (user.fcmToken) {
                                await sendPushNotification(user.fcmToken, broadcast.title, broadcast.templateId.body);
                                result.success = true;
                            } else {
                                // For simulation, assume success if token exists or just log
                                console.log(`[PUSH] Skipping ${user.email} - No FCM Token`);
                            }
                            break;

                        case 'SMS':
                            if (user.mobileNumber) {
                                await sendSMS(user.mobileNumber, broadcast.templateId.body);
                                result.success = true;
                            }
                            break;

                        case 'WhatsApp':
                            if (user.mobileNumber) {
                                await sendWhatsApp(user.mobileNumber, broadcast.templateId.body, broadcast.templateId.mediaUrl);
                                result.success = true;
                            }
                            break;
                    }

                    if (result.success) sentCount++;
                    else failedCount++;
                    
                } catch (err) {
                    failedCount++;
                    console.error(`Broadcast failed for ${user.email || 'user'}:`, err.message);
                }
            }

            broadcast.status = 'Completed';
            broadcast.completedAt = new Date();
            broadcast.stats.sent = sentCount;
            broadcast.stats.failed = failedCount;
            await broadcast.save();

            // Log activity
            await AdminAuditLog.create({
                adminId: req.user.id,
                action: 'BROADCAST_COMPLETED',
                targetType: 'Broadcast',
                targetId: broadcast._id,
                notes: `Broadcast "${broadcast.title}" finished: ${sentCount} sent, ${failedCount} failed.`
            });
        };

        // Trigger processing (not awaiting so we can return response)
        processDelivery();

        res.json({ success: true, msg: 'Broadcast started successfully', broadcastId: broadcast._id });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

/**
 * Get distinct cities and roles for segment filtering
 */
exports.getSegmentsData = async (req, res) => {
    try {
        const cities = await User.distinct('city', { city: { $ne: null } });
        const RBACRole = require('../models/RBACRole');
        const adminRoles = await RBACRole.find().select('name');
        const adminRoleNames = adminRoles.map(r => r.name);
        
        const roles = [...new Set([...adminRoleNames, 'Company Owner', 'Brand Owner', 'Merchant', 'User'])];
        res.json({ success: true, cities, roles });
    } catch (err) {
        res.status(500).json({ success: false, msg: 'Server Error' });
    }
};
