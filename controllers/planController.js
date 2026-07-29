const Plan = require('../models/Plan');
const AdminAuditLog = require('../models/AdminAuditLog');

// @desc    Get all plans
// @route   GET /api/plans
// @access  Public
exports.getPlans = async (req, res) => {
    try {
        const plans = await Plan.find({ isVisible: true, isArchived: false }).sort({ displayOrder: 1 });
        res.json(plans);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

// @desc    Admin: Get all plans (including hidden/archived)
// @route   GET /api/plans/admin
// @access  Private/Admin
exports.getAdminPlans = async (req, res) => {
    try {
        const plans = await Plan.find().sort({ displayOrder: 1 });
        res.json(plans);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

// @desc    Admin: Create a plan
// @route   POST /api/plans
// @access  Private/Admin
exports.createPlan = async (req, res) => {
    try {
        const plan = new Plan(req.body);
        await plan.save();

        // Log audit
        await AdminAuditLog.create({
            adminId: req.user._id,
            action: 'PLAN_CREATED',
            targetType: 'Plan',
            targetId: plan._id,
            notes: `Name: ${plan.name}`,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        });

        res.status(201).json(plan);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

// @desc    Admin: Update a plan
// @route   PUT /api/plans/:id
// @access  Private/Admin
exports.updatePlan = async (req, res) => {
    try {
        const plan = await Plan.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!plan) return res.status(404).json({ msg: 'Plan not found' });

        // Log audit
        await AdminAuditLog.create({
            adminId: req.user._id,
            action: 'PLAN_UPDATED',
            targetType: 'Plan',
            targetId: plan._id,
            notes: `Name: ${plan.name}`,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        });

        res.json(plan);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

// @desc    Admin: Delete/Archive a plan
// @route   DELETE /api/plans/:id
// @access  Private/Admin
exports.deletePlan = async (req, res) => {
    try {
        const plan = await Plan.findById(req.params.id);
        if (!plan) return res.status(404).json({ msg: 'Plan not found' });
        
        // Soft delete/Archive
        plan.isArchived = true;
        await plan.save();
        
        // Log audit
        await AdminAuditLog.create({
            adminId: req.user._id,
            action: 'PLAN_ARCHIVED',
            targetType: 'Plan',
            targetId: plan._id,
            notes: `Name: ${plan.name}`,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        });

        res.json({ msg: 'Plan archived successfully' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};
