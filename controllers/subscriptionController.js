const Subscription = require('../models/Subscription');
const Plan = require('../models/Plan');
const Transaction = require('../models/Transaction');
const Invoice = require('../models/Invoice');
const Refund = require('../models/Refund');
const AdminAuditLog = require('../models/AdminAuditLog');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const { createInvoice } = require('../services/invoiceService');

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_mock_id',
    key_secret: process.env.RAZORPAY_KEY_SECRET || 'mock_secret'
});

// @desc    Get current subscription for a business
// @route   GET /api/subscriptions/business/:businessId
// @access  Private
exports.getBusinessSubscription = async (req, res) => {
    try {
        const subscription = await Subscription.findOne({ 
            businessId: req.params.businessId,
            status: { $in: ['active', 'grace_period'] }
        }).populate('planId');
        
        if (!subscription) {
            return res.status(404).json({ msg: 'No active subscription found for this business' });
        }
        
        res.json(subscription);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

// @desc    Create Razorpay Order
// @route   POST /api/subscriptions/create-order
// @access  Private
exports.createRazorpayOrder = async (req, res) => {
    try {
        const { planId, billingCycle, businessId } = req.body;
        const plan = await Plan.findById(planId);
        if (!plan) return res.status(404).json({ msg: 'Plan not found' });

        const amount = billingCycle === 'annual' ? plan.priceAnnual : plan.priceMonthly;
        
        const options = {
            amount: amount * 100, // Amount in paise
            currency: 'INR',
            receipt: `rcpt_${businessId}_${Date.now()}`,
            metadata: {
                businessId,
                planId,
                billingCycle
            }
        };

        const order = await razorpay.orders.create(options);
        
        // Log transaction as pending
        const transaction = new Transaction({
            businessId,
            amount,
            status: 'pending',
            gateway: 'razorpay',
            gatewayOrderId: order.id,
            metadata: { planId, billingCycle }
        });
        await transaction.save();

        res.json({
            success: true,
            orderId: order.id,
            amount: order.amount,
            currency: order.currency
        });
    } catch (err) {
        console.error('Razorpay Order Error:', err);
        res.status(500).json({ msg: 'Payment initialization failed' });
    }
};

// @desc    Verify Razorpay Payment
// @route   POST /api/subscriptions/verify-payment
// @access  Private
exports.verifyRazorpayPayment = async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, businessId, billingDetails } = req.body;

        const body = razorpay_order_id + "|" + razorpay_payment_id;
        const expectedSignature = crypto
            .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET || 'mock_secret')
            .update(body.toString())
            .digest("hex");

        if (expectedSignature !== razorpay_signature) {
            return res.status(400).json({ msg: "Invalid payment signature" });
        }

        const transaction = await Transaction.findOne({ gatewayOrderId: razorpay_order_id });
        if (!transaction) return res.status(404).json({ msg: "Transaction record not found" });

        const { planId, billingCycle } = transaction.metadata;

        // Update Transaction
        transaction.status = 'success';
        transaction.gatewayPaymentId = razorpay_payment_id;
        transaction.gatewaySignature = razorpay_signature;
        await transaction.save();

        // Calculate End Date
        const startDate = new Date();
        const endDate = new Date();
        if (billingCycle === 'annual') endDate.setFullYear(endDate.getFullYear() + 1);
        else endDate.setMonth(endDate.getMonth() + 1);

        // Update/Create Subscription
        let subscription = await Subscription.findOne({ businessId });
        if (subscription) {
            subscription.planId = planId;
            subscription.status = 'active';
            subscription.billingCycle = billingCycle;
            subscription.startDate = startDate;
            subscription.endDate = endDate;
            subscription.priceAtPurchase = transaction.amount;
            subscription.lastTransactionId = transaction._id;
        } else {
            subscription = new Subscription({
                businessId,
                planId,
                billingCycle,
                startDate,
                endDate,
                priceAtPurchase: transaction.amount,
                lastTransactionId: transaction._id
            });
        }
        await subscription.save();

        // Create Invoice
        await createInvoice({
            businessId,
            transactionId: transaction._id,
            amount: transaction.amount,
            billingDetails
        });

        transaction.subscriptionId = subscription._id;
        await transaction.save();

        res.json({ success: true, subscription });
    } catch (err) {
        console.error('Payment Verification Error:', err);
        res.status(500).json({ msg: 'Payment verification failed' });
    }
};

// @desc    Toggle Auto Renew
// @route   PATCH /api/subscriptions/toggle-autorenew/:id
// @access  Private
exports.toggleAutoRenew = async (req, res) => {
    try {
        const subscription = await Subscription.findById(req.params.id);
        if (!subscription) return res.status(404).json({ msg: 'Subscription not found' });

        subscription.autoRenew = !subscription.autoRenew;
        await subscription.save();

        res.json({ success: true, autoRenew: subscription.autoRenew });
    } catch (err) {
        res.status(500).send('Server Error');
    }
};

// @desc    Request Refund
// @route   POST /api/subscriptions/request-refund
// @access  Private
exports.requestRefund = async (req, res) => {
    try {
        const { transactionId, reason } = req.body;
        const transaction = await Transaction.findById(transactionId);
        if (!transaction) return res.status(404).json({ msg: 'Transaction not found' });

        const refund = new Refund({
            businessId: transaction.businessId,
            transactionId,
            amount: transaction.amount,
            reason,
            status: 'pending'
        });
        await refund.save();

        res.json({ success: true, msg: 'Refund request submitted' });
    } catch (err) {
        res.status(500).send('Server Error');
    }
};

// @desc    Mock Checkout and Subscribe (Legacy)
exports.mockCheckout = async (req, res) => {
    try {
        const { businessId, planId, billingCycle, amount } = req.body;
        const plan = await Plan.findById(planId);
        if (!plan) return res.status(404).json({ msg: 'Plan not found' });

        const transaction = new Transaction({
            businessId,
            amount,
            status: 'success',
            gateway: 'manual',
            metadata: { planId, billingCycle }
        });
        await transaction.save();

        const startDate = new Date();
        const endDate = new Date();
        if (billingCycle === 'annual') endDate.setFullYear(endDate.getFullYear() + 1);
        else endDate.setMonth(endDate.getMonth() + 1);

        let subscription = await Subscription.findOne({ businessId });
        if (subscription) {
            subscription.planId = planId;
            subscription.status = 'active';
            subscription.billingCycle = billingCycle;
            subscription.startDate = startDate;
            subscription.endDate = endDate;
            subscription.priceAtPurchase = amount;
            subscription.lastTransactionId = transaction._id;
        } else {
            subscription = new Subscription({
                businessId,
                planId,
                billingCycle,
                startDate,
                endDate,
                priceAtPurchase: amount,
                lastTransactionId: transaction._id
            });
        }
        await subscription.save();

        await createInvoice({
            businessId,
            transactionId: transaction._id,
            amount: amount,
            billingDetails: { name: 'Mock User', address: '123 Mock St' }
        });

        transaction.subscriptionId = subscription._id;
        await transaction.save();

        res.json({ success: true, subscription });
    } catch (err) {
        res.status(500).send('Server Error');
    }
};

// @desc    Admin: Manually assign/update subscription for a business
// @route   POST /api/subscriptions/admin-assign
// @access  Private/Admin
exports.adminAssignSubscription = async (req, res) => {
    try {
        const { businessId, planId, billingCycle, startDate, endDate, priceAtPurchase, status } = req.body;

        const plan = await Plan.findById(planId);
        if (!plan) return res.status(404).json({ msg: 'Plan not found' });

        let subscription = await Subscription.findOne({ businessId });

        if (subscription) {
            subscription.planId = planId;
            subscription.billingCycle = billingCycle;
            subscription.startDate = startDate || subscription.startDate;
            subscription.endDate = endDate;
            subscription.priceAtPurchase = priceAtPurchase;
            subscription.status = status || 'active';
        } else {
            subscription = new Subscription({
                businessId,
                planId,
                billingCycle,
                startDate: startDate || new Date(),
                endDate,
                priceAtPurchase,
                status: status || 'active'
            });
        }

        await subscription.save();

        // Log audit
        await AdminAuditLog.create({
            adminId: req.user._id,
            action: subscription.__v === 0 ? 'SUBSCRIPTION_ASSIGNED' : 'SUBSCRIPTION_UPDATED',
            targetType: 'Subscription',
            targetId: subscription._id,
            notes: `Plan: ${plan.name}, Cycle: ${billingCycle}`,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        });

        res.json({
            success: true,
            data: subscription
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};
