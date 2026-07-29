const express = require('express');
const router = express.Router();
const { getSettings, updateSettings, getPanelConfig } = require('../controllers/settingController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.get('/', getSettings);
router.get('/panel-config', getPanelConfig);
router.put('/', protect, authorize('Super Admin'), updateSettings);

module.exports = router;
