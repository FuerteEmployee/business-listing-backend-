const Lead = require('../models/Lead');
const Company = require('../models/Company');
const User = require('../models/User');
const sendEmail = require('../utils/email');
const { sendSMS } = require('../utils/sms');
const { sendPushNotification } = require('../utils/push');

// ============================================================
// AI: Lead Scoring Engine
// Computes a 0-100 score based on signals derived from lead data.
// ============================================================
const computeLeadScore = (lead) => {
    if (lead.status === 'Converted') return 100;
    if (lead.status === 'Lost' || lead.status === 'Closed') return 0;

    let score = 0;

    // Priority signal
    if (lead.priority === 'Hot') score += 30;
    else if (lead.priority === 'Warm') score += 15;

    // Lead type signal
    if (lead.type === 'Luxury' || lead.type === 'Requirement') score += 20;
    else if (lead.type === 'Budget') score += 10;

    // Pipeline stage signal (how far along in the funnel)
    if (lead.status === 'Quotation Sent') score += 18;
    else if (lead.status === 'Interested') score += 14;
    else if (lead.status === 'Contacted') score += 7;

    // Engagement signal (has notes = actively managed)
    if (lead.notes && lead.notes.length > 0) score += 10;
    if (lead.notes && lead.notes.length > 2) score += 5; // bonus for very engaged leads

    // Freshness signal (created in last 24 hours)
    const ageHours = (Date.now() - new Date(lead.createdAt).getTime()) / 3600000;
    if (ageHours < 24) score += 10;
    else if (ageHours > 72) score -= 5; // stale penalty

    // Assignment signal (assigned = being worked)
    if (lead.assignedTo) score += 7;

    return Math.min(100, Math.max(0, score));
};

// Create a new lead (enquiry)
exports.createLead = async (req, res) => {
    try {
        const { name, phone, category, type, businessId, agreedToPrivacy, source } = req.body;
        if (!name || !phone) {
            return res.status(400).json({ success: false, message: 'Name and phone are required.' });
        }

        // Duplicate Check (Same phone + category in last 12 hours)
        const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);
        const duplicate = await Lead.findOne({
            phone,
            category,
            createdAt: { $gt: twelveHoursAgo }
        });

        if (duplicate) {
            return res.status(400).json({ 
                success: false, 
                message: 'You have already submitted an enquiry for this category recently. Our team will contact you soon.' 
            });
        }

        const lead = new Lead({
            name,
            phone,
            category,
            type,
            business: businessId || null,
            agreedToPrivacy: !!agreedToPrivacy,
            source: source || 'Web Results'
        });

        // Simple Auto Distribution Logic
        if (category) {
            // Find a merchant with companies in this category who has the best performance score
            const merchant = await User.findOne({ 
                role: 'Merchant', 
                status: 'Active' 
            }).sort({ performanceScore: -1 });

            if (merchant) {
                lead.assignedTo = merchant._id;
                lead.assignedToName = merchant.name;
                lead.assignmentHistory.push({
                    assignedTo: merchant.name,
                    assignedBy: 'System Auto-Distribute'
                });
                
                // Update merchant stats (using findByIdAndUpdate to avoid password validation issues)
                await User.findByIdAndUpdate(merchant._id, {
                    $inc: { 'leadStats.totalAssigned': 1 }
                });

                // Send Unified Notification (Email, SMS, Push)
                const { sendNotification } = require('../services/notificationService');
                await sendNotification({
                    recipient: merchant._id,
                    type: 'Lead',
                    title: 'New Lead Auto-Assigned!',
                    message: `Hello ${merchant.name}, a new lead for ${category} has been automatically assigned to you.`,
                    link: '/brand/leads',
                    metadata: { leadId: lead._id.toString(), category }
                }).catch(e => console.error('Lead Notification error:', e));
            }
        }

        await lead.save();
        res.status(201).json({ success: true, lead });
    } catch (err) {
        console.error('Create Lead Error:', err.message);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Get all leads (admin)
exports.getLeads = async (req, res) => {
    try {
        const { userId } = req.query;
        let query = {};
        if (userId) query.userId = userId;
        
        const leads = await Lead.find(query)
            .sort({ createdAt: -1 })
            .populate('business')
            .populate('assignedTo', 'name email');

        // Append AI score to each lead
        const leadsWithScore = leads.map(lead => ({
            ...lead.toObject(),
            score: computeLeadScore(lead)
        }));

        res.json({ success: true, leads: leadsWithScore });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Get user's leads
exports.getUserLeads = async (req, res) => {
    try {
        const leads = await Lead.find({ 
            $or: [
                { userId: req.user._id },
                { phone: req.user.phone }, // fallback for leads submitted by phone number before login
                { email: req.user.email }
            ]
        })
        .sort({ createdAt: -1 })
        .populate('business', 'name slug');

        res.json({ success: true, leads });
    } catch (err) {
        console.error('Get User Leads Error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Update lead status/priority/followUp (admin)
exports.updateLeadStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, priority, followUpDate } = req.body;
        
        const lead = await Lead.findById(id);
        if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });

        // Response Time Tracking Logic
        if (status && lead.status === 'New' && status !== 'New') {
            lead.firstContactAt = new Date();
            const diffMs = lead.firstContactAt - lead.createdAt;
            lead.responseTime = Math.round(diffMs / 60000); // Minutes

            // Update Merchant Performance
            if (lead.assignedTo) {
                const user = await User.findById(lead.assignedTo);
                if (user) {
                    const totalL = user.leadStats.totalAssigned || 1;
                    const prevAvg = user.leadStats.avgResponseTime || 0;
                    await User.findByIdAndUpdate(user._id, {
                        'leadStats.avgResponseTime': Math.round((prevAvg * (totalL - 1) + lead.responseTime) / totalL),
                        $inc: { performanceScore: lead.responseTime < 60 ? 5 : lead.responseTime > 300 ? -2 : 0 }
                    });
                }
            }
        }

        // Conversion Tracking
        if (status === 'Converted' && lead.status !== 'Converted' && lead.assignedTo) {
            await User.findByIdAndUpdate(lead.assignedTo, {
                $inc: { 'leadStats.totalConverted': 1, performanceScore: 50 }
            });
        }

        if (status) lead.status = status;
        if (priority) lead.priority = priority;
        if (followUpDate) lead.followUpDate = followUpDate;
        
        if (req.body.merchantReply) {
            lead.merchantReply = {
                text: req.body.merchantReply,
                date: new Date()
            };
        }

        await lead.save();

        // 3. User Notifications (Push & SMS) on status change
        if (status && lead.phone) {
            const statusMsg = `Update: Your enquiry for ${lead.category} is now "${status}".`;
            
            // Send SMS
            await sendSMS(lead.phone, statusMsg);

            // Send Push if user is registered and has token
            const enquiryUser = await User.findOne({ 
                $or: [{ mobileNumber: lead.phone }, { email: lead.email }] 
            }).select('fcmToken');

            if (enquiryUser?.fcmToken) {
                await sendPushNotification(
                    enquiryUser.fcmToken, 
                    'Enquiry Status Update', 
                    statusMsg,
                    { leadId: lead._id.toString() }
                );
            }
        }

        res.json({ success: true, lead });
    } catch (err) {
        console.error('Update Lead Error:', err.message);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Add note to lead (admin)
exports.addNote = async (req, res) => {
    try {
        const { id } = req.params;
        const { text } = req.body;
        
        if (!text) return res.status(400).json({ success: false, message: 'Note text is required' });

        const lead = await Lead.findById(id);
        if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });

        lead.notes.push({
            text,
            addedBy: req.user ? req.user.name : 'Admin'
        });

        await lead.save();
        res.json({ success: true, lead });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Assign lead (admin)
exports.assignLead = async (req, res) => {
    try {
        const { id } = req.params;
        const { assignedTo, assignedToName } = req.body;

        const lead = await Lead.findById(id);
        if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });

        lead.assignedTo = assignedTo; // ObjectId
        lead.assignedToName = assignedToName;
        lead.assignmentHistory.push({
            assignedTo: assignedToName,
            assignedBy: req.user ? req.user.name : 'Admin'
        });

        if (assignedTo) {
            const user = await User.findByIdAndUpdate(assignedTo, {
                $inc: { 'leadStats.totalAssigned': 1 }
            });

            if (user) {
                const { sendNotification } = require('../services/notificationService');
                await sendNotification({
                    recipient: user._id,
                    type: 'Lead',
                    title: 'New Lead Assigned to You',
                    message: `Hello ${user.name}, a new lead (${lead.name}) has been assigned to you by an admin.`,
                    link: '/brand/leads',
                    metadata: { leadId: lead._id.toString() }
                }).catch(e => console.error('Lead Assignment Notification error:', e));
            }
        }

        await lead.save();
        res.json({ success: true, lead });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

// Get Lead Stats (admin)
exports.getLeadStats = async (req, res) => {
    try {
        const total = await Lead.countDocuments();
        const converted = await Lead.countDocuments({ status: 'Converted' });
        const statusCounts = await Lead.aggregate([
            { $group: { _id: '$status', count: { $sum: 1 } } }
        ]);
        const priorityCounts = await Lead.aggregate([
            { $group: { _id: '$priority', count: { $sum: 1 } } }
        ]);
        const categoryCounts = await Lead.aggregate([
            { $group: { _id: '$category', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 5 }
        ]);

        // Stale hot leads (Hot priority, New/Contacted status, older than 48h)
        const staleHotCutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
        const staleHotLeads = await Lead.countDocuments({
            priority: 'Hot',
            status: { $in: ['New', 'Contacted'] },
            createdAt: { $lt: staleHotCutoff }
        });

        // Follow-ups due today
        const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
        const followUpsDueToday = await Lead.countDocuments({
            followUpDate: { $gte: todayStart, $lte: todayEnd }
        });

        // Source performance: conversion rate per source
        const sourcePerformance = await Lead.aggregate([
            { $group: {
                _id: '$source',
                total: { $sum: 1 },
                converted: { $sum: { $cond: [{ $eq: ['$status', 'Converted'] }, 1, 0] } }
            }},
            { $addFields: {
                conversionRate: { $cond: [{ $gt: ['$total', 0] }, { $divide: ['$converted', '$total'] }, 0] }
            }},
            { $sort: { conversionRate: -1 } },
            { $limit: 5 }
        ]);

        // Average response time across all assigned leads
        const responseTimeAgg = await Lead.aggregate([
            { $match: { responseTime: { $gt: 0 } } },
            { $group: { _id: null, avg: { $avg: '$responseTime' } } }
        ]);
        const avgResponseTime = responseTimeAgg[0]?.avg ? Math.round(responseTimeAgg[0].avg) : null;

        // Merchant Ranking
        const topPerformers = await User.find({ role: 'Merchant' })
            .sort({ performanceScore: -1 })
            .limit(5)
            .select('name performanceScore leadStats');

        res.json({
            success: true,
            stats: {
                total,
                conversionRate: total > 0 ? Math.round((converted / total) * 100) : 0,
                staleHotLeads,
                followUpsDueToday,
                avgResponseTime,
                statusDistribution: statusCounts,
                priorityDistribution: priorityCounts,
                topCategories: categoryCounts,
                sourcePerformance,
                topPerformers
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
};
// Delete all leads (Super Admin Only)
// @route   DELETE /api/leads
exports.clearAllLeads = async (req, res) => {
    try {
        await Lead.deleteMany({});
        res.json({ success: true, message: 'Lead pipeline has been purged.' });
    } catch (err) {
        console.error('Purge Lead Error:', err.message);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};
