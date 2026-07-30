const express = require('express');
const router = express.Router();
const {
    getServices,
    getService,
    createService,
    updateService,
    deleteService,
    reorderServices
} = require('../controllers/serviceController');

const { protect, authorize, attachOwnedBrands } = require('../middleware/authMiddleware');

// Public routes
router.route('/').get(getServices);
router.route('/:id').get(getService);

// Protected routes (Admin / Brand Owner)
router.use(protect);
router.use(authorize('Super Admin', 'Brand Owner', 'Company Owner', 'Merchant', 'owner', 'Owner', 'OWNER'));
router.use(attachOwnedBrands);

router.route('/').post(createService);
router.patch('/reorder', reorderServices);
router.route('/:id')
    .put(updateService)
    .delete(deleteService);

module.exports = router;
