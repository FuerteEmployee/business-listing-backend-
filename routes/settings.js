const express = require('express');
const router = express.Router();
const { getSettings, updateSettings, getPanelConfig } = require('../controllers/settingController');
const { protect, authorize, optionalAuth } = require('../middleware/authMiddleware');

// optionalAuth so anonymous visitors still get the public subset, while a
// Super Admin's token unlocks the admin-only fields (see getSettings).
router.get('/', optionalAuth, getSettings);
router.get('/panel-config', getPanelConfig);
router.put('/', protect, authorize('Super Admin'), updateSettings);

module.exports = router;
