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

const {
    protect,
    authorize,
    attachOwnedBrands,
    optionalAuth,
    BRAND_SCOPED_ROLES,
    allowAdminOrBrand
} = require('../middleware/authMiddleware');

// Public routes. Both use optionalAuth so that a signed-in brand owner is scoped
// to their own services, while anonymous visitors still see the public catalogue.
router.route('/').get(optionalAuth, getServices);
router.route('/:id').get(optionalAuth, getService);

// Protected routes (Admin / brand owners)
router.use(protect);
// Admins with listingManagement:write, or brand owners (ownership checked per item)
router.use(allowAdminOrBrand('listingManagement', 'write'));
router.use(require('../middleware/configMiddleware').brandFeature('servicecatalogue'));
router.use(attachOwnedBrands);

router.route('/').post(createService);
router.patch('/reorder', reorderServices);
router.route('/:id')
    .put(updateService)
    .delete(deleteService);

module.exports = router;
