const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
    createEnquiry,
    getUserEnquiries,
    getEnquiryDetail,
    deleteEnquiry,
    resolveEnquiry,
    getMerchantInbox,
    replyToEnquiry,
    markEnquiryAsSpam
} = require('../controllers/enquiryController');

// User enquiry routes
router.post('/', createEnquiry);

// All enquiry routes require authentication
router.use(protect);

router.get('/my-enquiries', getUserEnquiries);
router.get('/:id', getEnquiryDetail);
router.delete('/:id', deleteEnquiry);
router.put('/:id/resolve', resolveEnquiry);

// Merchant inbox routes
router.get('/merchant/inbox', getMerchantInbox);
router.post('/:id/reply', replyToEnquiry);
router.put('/:id/mark-spam', markEnquiryAsSpam);

module.exports = router;
