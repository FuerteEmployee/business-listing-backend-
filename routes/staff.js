const express = require('express');
const router = express.Router();
const {
    inviteStaffMember,
    getStaffMembers,
    removeStaffMember,
    updateStaffMember
} = require('../controllers/staffController');
const { protect } = require('../middleware/authMiddleware');

// All routes in this file are protected
router.use(protect);

router.post('/invite', inviteStaffMember);
router.get('/', getStaffMembers);
router.delete('/:id', removeStaffMember);
router.put('/:id', updateStaffMember);

module.exports = router;
