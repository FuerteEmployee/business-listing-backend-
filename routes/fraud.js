const express = require('express');
const router = express.Router();
const {
    runFraudDetection,
    getFraudDashboard,
    assignFraudAlert,
    moderateFraudAlert,
    bulkQuarantineAccounts,
    getBlacklist,
    addToBlacklist,
    removeFromBlacklist,
    importBlacklistCSV,
    exportBlacklistCSV
} = require('../controllers/fraudController');
const { protect, authorize } = require('../middleware/authMiddleware');

// All routes require admin/super admin access
router.use(protect);
router.use(authorize('Admin', 'Super Admin'));

// Fraud detection routes
router.post('/run-detection', runFraudDetection);
router.get('/dashboard', getFraudDashboard);
router.put('/alerts/:alertId/assign', assignFraudAlert);
router.put('/alerts/:alertId/moderate', moderateFraudAlert);
router.post('/bulk-quarantine', bulkQuarantineAccounts);

// Blacklist management routes
router.get('/blacklist', getBlacklist);
router.post('/blacklist', addToBlacklist);
router.delete('/blacklist/:id', removeFromBlacklist);
router.post('/blacklist/import-csv', importBlacklistCSV);
router.get('/blacklist/export-csv', exportBlacklistCSV);

module.exports = router;