const express = require('express');
const router = express.Router();
const { protect, authorize, checkPermission } = require('../middleware/authMiddleware');
const {
    getAllUsersAdmin,
    getUserDetailAdmin,
    verifyUser,
    banUser,
    unbanUser,
    forcePasswordReset,
    impersonateUser,
    deleteOrAnonymizeUser,
    mergeAccounts,
    bulkUserAction,
    sendSystemMessage,
    exportUsersToCsv,
    forceLogout,
    createAdminUser,
    updateAdminUser,
    createUser,
    updateUser
} = require('../controllers/adminUserController');
const ipWhitelist = require('../middleware/ipWhitelistMiddleware');
const {
    getAllListingsAdmin,
    getListingDetailAdmin,
    approveListing,
    rejectListing,
    requestMoreInfo,
    verifyBusinessBadge,
    flagListing,
    suspendListing,
    deleteListing,
    checkDuplicates,
    bulkListingAction,
    exportListingsCsv,
    getListingAuditTrail,
    createListingAdmin,
    updateListingAdmin,
    updateListingRank,
    bulkReorderListings,
    importListings
} = require('../controllers/adminListingController');
const {
    getAllReviewsAdmin,
    bulkReviewAction,
    addModerationNote
} = require('../controllers/adminReviewController');
const {
    getAllRoles,
    getRoleDetail,
    createRole,
    updateRole,
    deleteRole
} = require('../controllers/adminRoleController');
const {
    getAuditLogs,
    getAuditLogDetail,
    getAuditReportByAction,
    getAuditReportByAdmin,
    getAdminActivitySummary,
    exportAuditLogsCsv
} = require('../controllers/auditLogController');
const {
    getTemplates,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    getBroadcasts,
    createBroadcast,
    executeBroadcast,
    deleteBroadcast,
    cloneBroadcast,
    getSegmentsData
} = require('../controllers/broadcastController');

// Protect all admin routes - requires authentication and IP whitelisting
router.use(protect);
router.use(ipWhitelist);

// ==================== USER MANAGEMENT ====================
router.get('/users', checkPermission('userManagement', 'read'), getAllUsersAdmin);
router.post('/users/standard', checkPermission('userManagement', 'write'), createUser);
router.put('/users/standard/:id', checkPermission('userManagement', 'write'), updateUser);
router.post('/users', checkPermission('adminManagement', 'write'), createAdminUser);
router.get('/users/:id', checkPermission('userManagement', 'read'), getUserDetailAdmin);
router.put('/users/:id', checkPermission('adminManagement', 'write'), updateAdminUser);
router.put('/users/:id/verify', checkPermission('userManagement', 'write'), verifyUser);
router.put('/users/:id/ban', checkPermission('userManagement', 'write'), banUser);
router.put('/users/:id/unban', checkPermission('userManagement', 'write'), unbanUser);
router.put('/users/:id/force-password-reset', checkPermission('userManagement', 'write'), forcePasswordReset);
router.put('/users/:id/force-logout', checkPermission('adminManagement', 'write'), forceLogout);
router.post('/users/:id/impersonate', checkPermission('impersonation', 'execute'), impersonateUser);
router.delete('/users/:id', checkPermission('userManagement', 'delete'), deleteOrAnonymizeUser);
router.post('/users/merge', checkPermission('userManagement', 'write'), mergeAccounts);
router.post('/users/bulk-action', checkPermission('userManagement', 'write'), bulkUserAction);
router.post('/users/:id/message', checkPermission('messaging', 'write'), sendSystemMessage);
router.get('/users/export/csv', checkPermission('reporting', 'export'), exportUsersToCsv);

// ==================== LISTING MANAGEMENT ====================
router.get('/listings', checkPermission('listingManagement', 'read'), getAllListingsAdmin);
router.post('/listings', checkPermission('listingManagement', 'write'), createListingAdmin);
router.get('/listings/:id', checkPermission('listingManagement', 'read'), getListingDetailAdmin);
router.put('/listings/:id', checkPermission('listingManagement', 'write'), updateListingAdmin);
router.put('/listings/:id/approve', checkPermission('listingManagement', 'approve'), approveListing);
router.put('/listings/:id/reject', checkPermission('listingManagement', 'approve'), rejectListing);
router.put('/listings/:id/request-info', checkPermission('listingManagement', 'write'), requestMoreInfo);
router.put('/listings/:id/verify-badge', checkPermission('listingManagement', 'write'), verifyBusinessBadge);
router.put('/listings/:id/flag', checkPermission('listingManagement', 'write'), flagListing);
router.put('/listings/:id/suspend', checkPermission('listingManagement', 'write'), suspendListing);
router.delete('/listings/:id', checkPermission('listingManagement', 'delete'), deleteListing);
router.get('/listings/:id/check-duplicates', checkPermission('listingManagement', 'read'), checkDuplicates);
router.post('/listings/bulk-action', checkPermission('listingManagement', 'write'), bulkListingAction);
router.post('/listings/import', checkPermission('listingManagement', 'write'), importListings);
router.get('/listings/export/csv', checkPermission('reporting', 'export'), exportListingsCsv);
router.get('/listings/:id/audit', checkPermission('listingManagement', 'read'), getListingAuditTrail);
router.put('/listings/:id/rank', checkPermission('listingManagement', 'write'), updateListingRank);
router.post('/listings/reorder', checkPermission('listingManagement', 'write'), bulkReorderListings);

// ==================== REVIEW MODERATION ====================
router.get('/reviews', checkPermission('reviewModeration', 'read'), getAllReviewsAdmin);
router.post('/reviews/bulk-action', checkPermission('reviewModeration', 'write'), bulkReviewAction);
router.put('/reviews/:id/note', checkPermission('reviewModeration', 'write'), addModerationNote);

// ==================== ROLE MANAGEMENT ====================
router.get('/roles', checkPermission('roleManagement', 'read'), getAllRoles);
router.get('/roles/:id', checkPermission('roleManagement', 'read'), getRoleDetail);
router.post('/roles', checkPermission('roleManagement', 'write'), createRole);
router.put('/roles/:id', checkPermission('roleManagement', 'write'), updateRole);
router.delete('/roles/:id', checkPermission('roleManagement', 'delete'), deleteRole);

// ==================== AUDIT LOGS ====================
router.get('/audit-logs/export/csv', checkPermission('reporting', 'export'), exportAuditLogsCsv);
router.get('/audit-logs', checkPermission('auditLog', 'read'), getAuditLogs);
router.get('/audit-logs/:id', checkPermission('auditLog', 'read'), getAuditLogDetail);
router.get('/audit-logs/report/by-action', checkPermission('auditLog', 'read'), getAuditReportByAction);
router.get('/audit-logs/report/by-admin', checkPermission('auditLog', 'read'), getAuditReportByAdmin);
router.get('/audit-logs/admin/:adminId/summary', checkPermission('auditLog', 'read'), getAdminActivitySummary);

// ==================== BROADCASTS & NOTIFICATIONS ====================
router.get('/broadcasts/templates', checkPermission('messaging', 'read'), getTemplates);
router.post('/broadcasts/templates', checkPermission('messaging', 'write'), createTemplate);
router.put('/broadcasts/templates/:id', checkPermission('messaging', 'write'), updateTemplate);
router.delete('/broadcasts/templates/:id', checkPermission('messaging', 'write'), deleteTemplate);

router.get('/broadcasts', checkPermission('messaging', 'read'), getBroadcasts);
router.get('/broadcasts/segments', checkPermission('messaging', 'read'), getSegmentsData);
router.post('/broadcasts', checkPermission('messaging', 'write'), createBroadcast);
router.post('/broadcasts/:id/execute', checkPermission('messaging', 'write'), executeBroadcast);
router.post('/broadcasts/:id/clone', checkPermission('messaging', 'write'), cloneBroadcast);
router.delete('/broadcasts/:id', checkPermission('messaging', 'write'), deleteBroadcast);

module.exports = router;

module.exports = router;
