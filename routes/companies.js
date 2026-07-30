const express = require('express');
const router = express.Router();
const { 
    getAllCompanies, 
    createCompany, 
    updateCompany, 
    deleteCompany, 
    getCompanyBySlug, 
    getCompanyById,
    getMyCompanies,
    claimCompany, 
    autocomplete,
    getSimilarBusinesses,
    getQuestions,
    postQuestion,
    importOSM
} = require('../controllers/companyController');
const { protect, attachOwnedBrands, checkPermission, optionalAuth } = require('../middleware/authMiddleware');

// @route   GET /api/companies/autocomplete
router.get('/autocomplete', autocomplete);

// @route   GET /api/companies
router.get('/', optionalAuth, getAllCompanies);

// @route   GET /api/companies/slug/:slug
router.get('/slug/:slug', getCompanyBySlug);

// @route   POST /api/companies
router.post('/', optionalAuth, createCompany);

// @route   PUT /api/companies/:id
router.put('/:id', protect, attachOwnedBrands, updateCompany);

// @route   DELETE /api/companies/:id
router.delete('/:id', protect, attachOwnedBrands, deleteCompany);

// @route   POST /api/companies/:id/claim
router.post('/:id/claim', protect, claimCompany);

// @route   GET /api/companies/:id/similar
router.get('/:id/similar', getSimilarBusinesses);

// @route   GET /api/companies/:id/questions
router.get('/:id/questions', getQuestions);

// @route   POST /api/companies/:id/questions
router.post('/:id/questions', protect, postQuestion);

// @route   POST /api/companies/import-osm
router.post('/import-osm', protect, checkPermission('listingManagement', 'write'), importOSM);

// @route   POST /api/companies/:id/report
router.post('/:id/report', protect, (req, res, next) => {
    const { reportCompany } = require('../controllers/companyController');
    reportCompany(req, res, next);
});

// @route   GET /api/companies/my-companies
router.get('/my-companies', protect, getMyCompanies);

// @route   GET /api/companies/:id
router.get('/:id', getCompanyById);

module.exports = router;
