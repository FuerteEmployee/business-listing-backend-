const Transaction = require('../models/Transaction');
const Invoice = require('../models/Invoice');
const Subscription = require('../models/Subscription');
const Plan = require('../models/Plan');
const Refund = require('../models/Refund');
const Payout = require('../models/Payout');
const AdminAuditLog = require('../models/AdminAuditLog');

// ── Helper ─────────────────────────────────────────────────────────────────
const startOf = (date) => { const d = new Date(date); d.setHours(0,0,0,0); return d; };
const endOf   = (date) => { const d = new Date(date); d.setHours(23,59,59,999); return d; };

// ── 54: Revenue Dashboard (MRR, ARR, Churn) ────────────────────────────────
// GET /api/revenue/dashboard
exports.getRevenueDashboard = async (req, res) => {
    try {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

        // MRR: sum of priceAtPurchase for active monthly subscriptions
        const mrrAgg = await Subscription.aggregate([
            { $match: { status: 'active', billingCycle: 'monthly' } },
            { $group: { _id: null, total: { $sum: '$priceAtPurchase' } } }
        ]);
        const mrr = mrrAgg[0]?.total || 0;

        // ARR: sum of active annual subs + (MRR × 12)
        const arrAgg = await Subscription.aggregate([
            { $match: { status: 'active', billingCycle: 'annual' } },
            { $group: { _id: null, total: { $sum: '$priceAtPurchase' } } }
        ]);
        const arr = (arrAgg[0]?.total || 0) + mrr * 12;

        // Total Revenue: all successful transactions
        const totalRevAgg = await Transaction.aggregate([
            { $match: { status: 'success' } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);
        const totalRevenue = totalRevAgg[0]?.total || 0;

        // Churn Rate: cancelled subs in last 30 days / total subs 30 days ago
        const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
        const cancelledCount = await Subscription.countDocuments({ status: 'cancelled', updatedAt: { $gte: thirtyDaysAgo } });
        const totalSubsCount = await Subscription.countDocuments({ createdAt: { $lte: thirtyDaysAgo } });
        const churnRate = totalSubsCount > 0 ? ((cancelledCount / totalSubsCount) * 100).toFixed(2) : 0;

        // Revenue trend: last 12 months
        const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);
        const revenueByMonth = await Transaction.aggregate([
            { $match: { status: 'success', createdAt: { $gte: twelveMonthsAgo } } },
            {
                $group: {
                    _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
                    revenue: { $sum: '$amount' },
                    count: { $sum: 1 }
                }
            },
            { $sort: { '_id.year': 1, '_id.month': 1 } }
        ]);

        // New subscribers per month
        const newSubsByMonth = await Subscription.aggregate([
            { $match: { createdAt: { $gte: twelveMonthsAgo } } },
            {
                $group: {
                    _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
                    count: { $sum: 1 }
                }
            },
            { $sort: { '_id.year': 1, '_id.month': 1 } }
        ]);

        // Active / Expired / Cancelled counts
        const subStatusCounts = await Subscription.aggregate([
            { $group: { _id: '$status', count: { $sum: 1 } } }
        ]);

        // Revenue this month
        const monthRevAgg = await Transaction.aggregate([
            { $match: { status: 'success', createdAt: { $gte: startOfMonth, $lte: endOfMonth } } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);
        const revenueThisMonth = monthRevAgg[0]?.total || 0;

        res.json({
            mrr, arr, totalRevenue, revenueThisMonth,
            churnRate: parseFloat(churnRate),
            revenueByMonth,
            newSubsByMonth,
            subStatusCounts
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: 'Server Error' });
    }
};

// ── 55: Transaction History ─────────────────────────────────────────────────
// GET /api/revenue/transactions?page=1&limit=20&status=&gateway=&from=&to=&search=
exports.getTransactions = async (req, res) => {
    try {
        const { page = 1, limit = 20, status, gateway, from, to, search } = req.query;
        const filter = {};
        if (status)  filter.status  = status;
        if (gateway) filter.gateway = gateway;
        if (from || to) {
            filter.createdAt = {};
            if (from) filter.createdAt.$gte = startOf(from);
            if (to)   filter.createdAt.$lte = endOf(to);
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);

        let query = Transaction.find(filter)
            .populate('businessId', 'name phone email')
            .populate('subscriptionId', 'billingCycle')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const [transactions, total] = await Promise.all([
            query,
            Transaction.countDocuments(filter)
        ]);

        // Client-side search filter on populated name
        const filtered = search
            ? transactions.filter(t =>
                t.businessId?.name?.toLowerCase().includes(search.toLowerCase()) ||
                t.gatewayPaymentId?.toLowerCase().includes(search.toLowerCase())
              )
            : transactions;

        res.json({ transactions: filtered, total, page: parseInt(page), pages: Math.ceil(total / limit) });
    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: 'Server Error' });
    }
};

// ── 56: Refund Queue ──────────────────────────────────────────────────────
// GET /api/revenue/refunds?status=pending
exports.getRefundQueue = async (req, res) => {
    try {
        const { status = 'pending', page = 1, limit = 20 } = req.query;
        const filter = {};
        if (status !== 'all') filter.status = status;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const [refunds, total] = await Promise.all([
            Refund.find(filter)
                .populate('transactionId', 'amount gateway gatewayPaymentId createdAt')
                .populate('businessId', 'name email phone')
                .populate('resolvedBy', 'name')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit)),
            Refund.countDocuments(filter)
        ]);

        res.json({ refunds, total, page: parseInt(page), pages: Math.ceil(total / limit) });
    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: 'Server Error' });
    }
};

// PATCH /api/revenue/refunds/:id
exports.handleRefund = async (req, res) => {
    try {
        const { status, adminNote } = req.body;
        if (!['approved', 'rejected'].includes(status)) {
            return res.status(400).json({ msg: 'Invalid status' });
        }

        const refund = await Refund.findById(req.params.id);
        if (!refund) return res.status(404).json({ msg: 'Refund not found' });

        refund.status      = status;
        refund.adminNote   = adminNote || '';
        refund.resolvedAt  = new Date();
        refund.resolvedBy  = req.user._id;
        await refund.save();

        // If approved, update original transaction to refunded
        if (status === 'approved') {
            await Transaction.findByIdAndUpdate(refund.transactionId, { status: 'refunded' });
            await Invoice.findOneAndUpdate({ transactionId: refund.transactionId }, { status: 'refunded' });
        }

        await AdminAuditLog.create({
            adminId: req.user._id,
            action: `REFUND_${status.toUpperCase()}`,
            targetType: 'Refund',
            targetId: refund._id,
            notes: adminNote,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        });

        res.json({ success: true, refund });
    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: 'Server Error' });
    }
};

// ── 57: Invoice Manager / Re-generation ─────────────────────────────────────
// GET /api/revenue/invoices?page=1&limit=20&search=
exports.getInvoices = async (req, res) => {
    try {
        const { page = 1, limit = 20, search } = req.query;
        const filter = {};
        if (search) filter.invoiceNumber = { $regex: search, $options: 'i' };

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const [invoices, total] = await Promise.all([
            Invoice.find(filter)
                .populate('businessId', 'name email')
                .populate('transactionId', 'amount gateway status')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit)),
            Invoice.countDocuments(filter)
        ]);

        res.json({ invoices, total, page: parseInt(page), pages: Math.ceil(total / limit) });
    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: 'Server Error' });
    }
};

// POST /api/revenue/invoices/:id/regenerate
exports.regenerateInvoice = async (req, res) => {
    try {
        const invoice = await Invoice.findById(req.params.id);
        if (!invoice) return res.status(404).json({ msg: 'Invoice not found' });

        // Generate new invoice number with REG prefix to mark it as regenerated
        const newInvoiceNumber = `INV-REG-${Date.now()}`;
        invoice.invoiceNumber = newInvoiceNumber;
        invoice.pdfUrl        = null; // clear cached PDF
        invoice.date          = new Date();
        await invoice.save();

        await AdminAuditLog.create({
            adminId: req.user._id,
            action: 'INVOICE_REGENERATED',
            targetType: 'Invoice',
            targetId: invoice._id,
            notes: `New number: ${newInvoiceNumber}`,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        });

        res.json({ success: true, invoice });
    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: 'Server Error' });
    }
};

// ── 58: GST Report ───────────────────────────────────────────────────────────
// GET /api/revenue/gst-report?month=2026-03
exports.getGSTReport = async (req, res) => {
    try {
        const { month } = req.query; // e.g. "2026-03"
        let dateFilter = {};

        if (month) {
            const [yr, mo] = month.split('-').map(Number);
            dateFilter = {
                createdAt: {
                    $gte: new Date(yr, mo - 1, 1),
                    $lte: new Date(yr, mo, 0, 23, 59, 59, 999)
                }
            };
        }

        const report = await Invoice.aggregate([
            { $match: { status: 'paid', ...dateFilter } },
            {
                $lookup: {
                    from: 'companies',
                    localField: 'businessId',
                    foreignField: '_id',
                    as: 'business'
                }
            },
            { $unwind: { path: '$business', preserveNullAndEmpty: true } },
            {
                $group: {
                    _id: '$businessId',
                    businessName: { $first: '$business.name' },
                    gstin: { $first: '$billingDetails.gstin' },
                    taxableAmount: { $sum: '$amount' },
                    gstAmount: { $sum: '$taxAmount' },
                    totalAmount: { $sum: '$totalAmount' },
                    invoiceCount: { $sum: 1 }
                }
            },
            { $sort: { totalAmount: -1 } }
        ]);

        // Totals row
        const totals = report.reduce((acc, r) => ({
            taxableAmount: acc.taxableAmount + r.taxableAmount,
            gstAmount: acc.gstAmount + r.gstAmount,
            totalAmount: acc.totalAmount + r.totalAmount,
            invoiceCount: acc.invoiceCount + r.invoiceCount
        }), { taxableAmount: 0, gstAmount: 0, totalAmount: 0, invoiceCount: 0 });

        res.json({ report, totals, month: month || 'all' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: 'Server Error' });
    }
};

// ── 59: Failed Payment Retry Log ─────────────────────────────────────────────
// GET /api/revenue/failed-payments?page=1&limit=20
exports.getFailedPayments = async (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const [transactions, total] = await Promise.all([
            Transaction.find({ status: 'failed' })
                .populate('businessId', 'name email phone')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit)),
            Transaction.countDocuments({ status: 'failed' })
        ]);

        res.json({ transactions, total, page: parseInt(page), pages: Math.ceil(total / limit) });
    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: 'Server Error' });
    }
};

// POST /api/revenue/failed-payments/:id/retry
exports.retryPayment = async (req, res) => {
    try {
        const transaction = await Transaction.findById(req.params.id);
        if (!transaction) return res.status(404).json({ msg: 'Transaction not found' });
        if (transaction.status !== 'failed') return res.status(400).json({ msg: 'Only failed transactions can be retried' });

        // Track retry history in metadata
        const retries = transaction.metadata?.retries || [];
        retries.push({ attemptedAt: new Date(), attemptedBy: req.user._id });
        transaction.metadata = { ...transaction.metadata, retries, lastRetryAt: new Date() };
        await transaction.save();

        await AdminAuditLog.create({
            adminId: req.user._id,
            action: 'PAYMENT_RETRY_INITIATED',
            targetType: 'Transaction',
            targetId: transaction._id,
            notes: `Retry #${retries.length}`,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        });

        res.json({ success: true, retryCount: retries.length, transaction });
    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: 'Server Error' });
    }
};

// ── 60: Payout / Settlement Tracker ─────────────────────────────────────────
// GET /api/revenue/payouts?page=1&limit=20&status=
exports.getPayouts = async (req, res) => {
    try {
        const { page = 1, limit = 20, status } = req.query;
        const filter = {};
        if (status && status !== 'all') filter.status = status;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const [payouts, total] = await Promise.all([
            Payout.find(filter)
                .populate('businessId', 'name email phone')
                .populate('createdBy', 'name')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit)),
            Payout.countDocuments(filter)
        ]);

        res.json({ payouts, total, page: parseInt(page), pages: Math.ceil(total / limit) });
    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: 'Server Error' });
    }
};

// POST /api/revenue/payouts
exports.createPayout = async (req, res) => {
    try {
        const { businessId, amount, method, reference, notes } = req.body;

        const payout = new Payout({
            businessId, amount, method, reference, notes,
            createdBy: req.user._id
        });
        await payout.save();

        await AdminAuditLog.create({
            adminId: req.user._id,
            action: 'PAYOUT_CREATED',
            targetType: 'Payout',
            targetId: payout._id,
            notes: `Amount: ₹${amount} via ${method}`,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        });

        res.status(201).json({ success: true, payout });
    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: 'Server Error' });
    }
};

// PATCH /api/revenue/payouts/:id
exports.updatePayoutStatus = async (req, res) => {
    try {
        const { status, reference, notes } = req.body;
        const payout = await Payout.findById(req.params.id);
        if (!payout) return res.status(404).json({ msg: 'Payout not found' });

        payout.status    = status || payout.status;
        payout.reference = reference || payout.reference;
        payout.notes     = notes || payout.notes;
        if (status === 'paid') payout.settledAt = new Date();
        await payout.save();

        res.json({ success: true, payout });
    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: 'Server Error' });
    }
};
