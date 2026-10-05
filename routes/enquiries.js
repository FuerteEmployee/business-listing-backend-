const express = require('express');
const router = express.Router();
const { protect, optionalAuth } = require('../middleware/authMiddleware');
const {
    createEnquiry,
    getUserEnquiries,
    getEnquiryDetail,
    deleteEnquiry,
    resolveEnquiry,
    getBrandInbox,
    replyToEnquiry,
    markEnquiryAsSpam
} = require('../controllers/enquiryController');

// User enquiry routes. This one sits above the router.use(protect) below because guests
// may submit enquiries; optionalAuth attaches req.user when a token is present without
// rejecting anonymous callers, so the enquiry (and the Lead derived from it) records the
// submitting account instead of leaving userId permanently null.
router.post('/', optionalAuth, createEnquiry);

// All enquiry routes require authentication
router.use(protect);

router.get('/my-enquiries', getUserEnquiries);
router.get('/:id', getEnquiryDetail);
router.delete('/:id', deleteEnquiry);
router.put('/:id/resolve', resolveEnquiry);

// Brand Owner inbox routes
router.get('/brand/inbox', getBrandInbox);
router.post('/:id/reply', replyToEnquiry);
router.put('/:id/mark-spam', markEnquiryAsSpam);

module.exports = router;
