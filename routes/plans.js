const express = require('express');
const router = express.Router();
const { getPlans, getAdminPlans, createPlan, updatePlan, deletePlan } = require('../controllers/planController');
const { protect, admin } = require('../middleware/authMiddleware');

router.get('/', getPlans);
router.get('/admin', protect, admin, getAdminPlans);
router.post('/', protect, admin, createPlan);
router.put('/:id', protect, admin, updatePlan);
router.delete('/:id', protect, admin, deletePlan);

module.exports = router;
