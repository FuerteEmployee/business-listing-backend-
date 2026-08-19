const express = require('express');
const router = express.Router();
const { createLead, getLeads, getUserLeads, updateLeadStatus, addNote, assignLead, getLeadStats, getLeadById } = require('../controllers/leadController');
const { protect, admin } = require('../middleware/authMiddleware');
const Lead = require('../models/Lead');

// Middleware to authorize admin or assigned merchant/brand owner
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

// Public: Create a new lead (enquiry)
router.post('/', createLead);

// User: Get their own leads
router.get('/my-leads', protect, getUserLeads);

// Admin: Get analytics stats
router.get('/stats', protect, admin, getLeadStats);

// Admin: Get all leads
router.get('/', protect, admin, getLeads);

// User/Merchant/Admin: Get single lead details
router.get('/:id', protect, ensureOwnsOrAdminLead, getLeadById);

// Merchant/Admin: Update lead status/priority/followup
router.patch('/:id/status', protect, ensureOwnsOrAdminLead, updateLeadStatus);

// Admin: Assign lead
router.patch('/:id/assign', protect, admin, assignLead);

// Merchant/Admin: Add note to lead
router.post('/:id/notes', protect, ensureOwnsOrAdminLead, addNote);

module.exports = router;
