const express = require('express');
const router = express.Router();
const {
    getCountries, getStates, getCities, getAreas,
    adminGetCountries, createCountry, updateCountry, deleteCountry,
    adminGetStates, createState, updateState, deleteState,
    adminGetCities, createCity, updateCity, deleteCity,
    adminGetAreas, createArea, updateArea, deleteArea
} = require('../controllers/locationController');

const { protect, authorize } = require('../middleware/authMiddleware');

// Public endpoints (Used by frontend dropdowns)
router.get('/countries', getCountries);
router.get('/states', getStates);
router.get('/cities', getCities);
router.get('/areas', getAreas);

// Admin endpoints (Protected, only Super Admin)
const adminAuth = [protect, authorize('Super Admin')];

router.route('/admin/countries')
    .get(adminAuth, adminGetCountries)
    .post(adminAuth, createCountry);
router.route('/admin/countries/:id')
    .put(adminAuth, updateCountry)
    .delete(adminAuth, deleteCountry);

router.route('/admin/states')
    .get(adminAuth, adminGetStates)
    .post(adminAuth, createState);
router.route('/admin/states/:id')
    .put(adminAuth, updateState)
    .delete(adminAuth, deleteState);

router.route('/admin/cities')
    .get(adminAuth, adminGetCities)
    .post(adminAuth, createCity);
router.route('/admin/cities/:id')
    .put(adminAuth, updateCity)
    .delete(adminAuth, deleteCity);

router.route('/admin/areas')
    .get(adminAuth, adminGetAreas)
    .post(adminAuth, createArea);
router.route('/admin/areas/:id')
    .put(adminAuth, updateArea)
    .delete(adminAuth, deleteArea);

module.exports = router;
