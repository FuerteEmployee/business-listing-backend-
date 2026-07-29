const express = require('express');
const router = express.Router();
const { 
    getBusinessSubscription, 
    mockCheckout, 
    adminAssignSubscription,
    createRazorpayOrder,
    verifyRazorpayPayment,
    toggleAutoRenew,
    requestRefund
} = require('../controllers/subscriptionController');
const { protect, admin } = require('../middleware/authMiddleware');

router.get('/business/:businessId', protect, getBusinessSubscription);
router.post('/mock-checkout', protect, mockCheckout);
router.post('/admin-assign', protect, admin, adminAssignSubscription);

router.post('/create-order', protect, createRazorpayOrder);
router.post('/verify-payment', protect, verifyRazorpayPayment);
router.patch('/toggle-autorenew/:id', protect, toggleAutoRenew);
router.post('/request-refund', protect, requestRefund);

module.exports = router;
