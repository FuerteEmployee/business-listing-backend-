const express = require('express');
const router = express.Router();
const { createLead, getLeads, getUserLeads, updateLeadStatus, addNote, assignLead, getLeadStats } = require('../controllers/leadController');
const { protect, admin } = require('../middleware/authMiddleware');

// Public: Create a new lead (enquiry)
router.post('/', createLead);

// User: Get their own leads
router.get('/my-leads', protect, getUserLeads);

// Admin: Get analytics stats
router.get('/stats', protect, admin, getLeadStats);

// Admin: Get all leads
router.get('/', protect, admin, getLeads);

// Admin: Update lead status/priority/followup
router.patch('/:id/status', protect, admin, updateLeadStatus);

// Admin: Assign lead
router.patch('/:id/assign', protect, admin, assignLead);

// Admin: Add note to lead
router.post('/:id/notes', protect, admin, addNote);

module.exports = router;
