const express = require('express');
const { 
    register, 
    login, 
    getMe, 
    verifyEmail, 
    forgotPassword, 
    resetPassword,
    deleteAccount,
    deactivateAccount,
    getSessions,
    revokeAllSessions,
    googleLogin,
    facebookLogin
} = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');
const RBACRole = require('../models/RBACRole');

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.get('/me', protect, getMe);

// Returns the current user's RBAC role permissions (no RBAC check needed)
router.get('/my-permissions', protect, async (req, res) => {
    try {
        // Super Admin has all permissions
        if (req.user.role === 'Super Admin') {
            return res.json({ role: 'Super Admin', permissions: null, isSuperAdmin: true });
        }
        const role = await RBACRole.findOne({ name: req.user.role });
        if (!role) {
            return res.json({ role: req.user.role, permissions: {}, isSuperAdmin: false });
        }
        res.json({ role: role.name, permissions: role.permissions, isSuperAdmin: false });
    } catch (err) {
        res.status(500).json({ msg: 'Failed to fetch permissions' });
    }
});
router.get('/verify/:token', verifyEmail);
router.post('/forgotpassword', forgotPassword);
router.put('/resetpassword/:token', resetPassword);

// OAuth
router.post('/google', googleLogin);
router.post('/facebook', facebookLogin);

// Account & Session Management
router.delete('/account', protect, deleteAccount);
router.put('/deactivate', protect, deactivateAccount);
router.get('/sessions', protect, getSessions);
router.delete('/sessions', protect, revokeAllSessions);

module.exports = router;
