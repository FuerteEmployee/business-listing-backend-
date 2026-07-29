const Coupon = require('../models/Coupon');
const AdminAuditLog = require('../models/AdminAuditLog');

// @desc    Admin: Get all coupons
// @route   GET /api/coupons
// @access  Private/Admin
exports.getCoupons = async (req, res) => {
    try {
        const coupons = await Coupon.find().sort({ createdAt: -1 });
        res.json(coupons);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

// @desc    Admin: Create a coupon
// @route   POST /api/coupons
// @access  Private/Admin
exports.createCoupon = async (req, res) => {
    try {
        const coupon = new Coupon(req.body);
        await coupon.save();

        // Log audit
        await AdminAuditLog.create({
            adminId: req.user._id,
            action: 'COUPON_CREATED',
            targetType: 'Coupon',
            targetId: coupon._id,
            notes: `Code: ${coupon.code}, Type: ${coupon.discountType}, Value: ${coupon.discountValue}`,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        });

        res.status(201).json(coupon);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

// @desc    Validate a coupon code
// @route   POST /api/coupons/validate
// @access  Public
exports.validateCoupon = async (req, res) => {
    try {
        const { code } = req.body;
        const coupon = await Coupon.findOne({ code, isActive: true });
        
        if (!coupon) {
            return res.status(404).json({ msg: 'Invalid or inactive coupon code' });
        }

        if (coupon.expiryDate && new Date(coupon.expiryDate) < new Date()) {
            return res.status(400).json({ msg: 'Coupon has expired' });
        }

        if (coupon.usageLimit > 0 && coupon.usageCount >= coupon.usageLimit) {
            return res.status(400).json({ msg: 'Coupon usage limit reached' });
        }

        res.json({
            success: true,
            discountType: coupon.discountType,
            discountValue: coupon.discountValue
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

// @desc    Admin: Toggle coupon status
// @route   PATCH /api/coupons/:id/toggle
// @access  Private/Admin
exports.toggleCoupon = async (req, res) => {
    try {
        const coupon = await Coupon.findById(req.params.id);
        if (!coupon) return res.status(404).json({ msg: 'Coupon not found' });
        
        coupon.isActive = !coupon.isActive;
        await coupon.save();

        // Log audit
        await AdminAuditLog.create({
            adminId: req.user._id,
            action: 'COUPON_TOGGLED',
            targetType: 'Coupon',
            targetId: coupon._id,
            notes: `Status changed to: ${coupon.isActive ? 'Active' : 'Inactive'}`,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        });

        res.json(coupon);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

// @desc    Admin: Update a coupon
// @route   PUT /api/coupons/:id
// @access  Private/Admin
exports.updateCoupon = async (req, res) => {
    try {
        const coupon = await Coupon.findByIdAndUpdate(
            req.params.id, 
            req.body, 
            { new: true, runValidators: true }
        );
        if (!coupon) return res.status(404).json({ msg: 'Coupon not found' });

        // Log audit
        await AdminAuditLog.create({
            adminId: req.user._id,
            action: 'COUPON_UPDATED',
            targetType: 'Coupon',
            targetId: coupon._id,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        });

        res.json(coupon);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};
