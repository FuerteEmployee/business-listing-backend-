const express = require('express');
const router = express.Router();
const { createLead, getLeads, getUserLeads, getBrandLeads, updateLeadStatus, addNote, assignLead, getLeadStats, getLeadById } = require('../controllers/leadController');
const { protect, admin, optionalAuth, authorize, attachOwnedBrands, BRAND_SCOPED_ROLES } = require('../middleware/authMiddleware');
const Lead = require('../models/Lead');

// Middleware to authorize admin or the assigned / owning brand owner.
// Relies on attachOwnedBrands having populated req.ownedBrandIds.
const ensureOwnsOrAdminLead = async (req, res, next) => {
    if (req.user && (req.user.role === 'Admin' || req.user.role === 'Super Admin' || req.user.role === 'admin')) {
        return next();
    }
    try {
        const lead = await Lead.findById(req.params.id);
        if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });

        const isAssigned = lead.assignedTo && lead.assignedTo.toString() === req.user.id;
        const ownedIds = (req.ownedBrandIds || []).map(id => id.toString());
        const isOwnedBusiness = lead.business && ownedIds.includes(lead.business.toString());

        if (!isAssigned && !isOwnedBusiness) {
            return res.status(403).json({ success: false, message: 'Not authorized to access this lead' });
        }
        next();
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

// Public: Create a new lead (enquiry). optionalAuth never rejects - it just attaches
// req.user when a token is present, so a signed-in submitter gets linked to the lead
// while guest submissions continue to work unauthenticated.
router.post('/', optionalAuth, createLead);

// User: Get their own leads
router.get('/my-leads', protect, getUserLeads);

// Brand Owner: Get leads for the brands they own
router.get('/brand', protect, authorize(...BRAND_SCOPED_ROLES), attachOwnedBrands, getBrandLeads);

// Admin: Get analytics stats
router.get('/stats', protect, admin, getLeadStats);

// Admin: Get all leads
router.get('/', protect, admin, getLeads);

// User/Brand Owner/Admin: Get single lead details
router.get('/:id', protect, attachOwnedBrands, ensureOwnsOrAdminLead, getLeadById);

// Brand Owner/Admin: Update lead status/priority/followup
router.patch('/:id/status', protect, attachOwnedBrands, ensureOwnsOrAdminLead, updateLeadStatus);

// Admin: Assign lead
router.patch('/:id/assign', protect, admin, assignLead);

// Brand Owner/Admin: Add note to lead
router.post('/:id/notes', protect, attachOwnedBrands, ensureOwnsOrAdminLead, addNote);

module.exports = router;
