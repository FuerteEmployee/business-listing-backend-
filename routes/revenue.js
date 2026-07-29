const express = require('express');
const router = express.Router();
const { protect, admin } = require('../middleware/authMiddleware');
const {
    getRevenueDashboard,
    getTransactions,
    getRefundQueue,
    handleRefund,
    getInvoices,
    regenerateInvoice,
    getGSTReport,
    getFailedPayments,
    retryPayment,
    getPayouts,
    createPayout,
    updatePayoutStatus
} = require('../controllers/revenueController');

// All routes: admin only
router.get('/dashboard',        protect, admin, getRevenueDashboard);
router.get('/transactions',     protect, admin, getTransactions);
router.get('/refunds',          protect, admin, getRefundQueue);
router.patch('/refunds/:id',    protect, admin, handleRefund);
router.get('/invoices',         protect, admin, getInvoices);
router.post('/invoices/:id/regenerate', protect, admin, regenerateInvoice);
router.get('/gst-report',       protect, admin, getGSTReport);
router.get('/failed-payments',  protect, admin, getFailedPayments);
router.post('/failed-payments/:id/retry', protect, admin, retryPayment);
router.get('/payouts',          protect, admin, getPayouts);
router.post('/payouts',         protect, admin, createPayout);
router.patch('/payouts/:id',    protect, admin, updatePayoutStatus);

module.exports = router;
