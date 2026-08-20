const express = require('express');
const router = express.Router();
const { 
    getProfile, 
    updateProfile, 
    getSavedListings, 
    toggleSaveListing, 
    manageAddressBook,
    requestProfileChange,
    verifyProfileChange,
    updateFcmToken,
    getSavedProducts,
    toggleSaveProduct
} = require('../controllers/userProfileController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

router.get('/profile', getProfile);
router.put('/profile', updateProfile);
router.post('/request-change', requestProfileChange);
router.post('/verify-change', verifyProfileChange);
router.put('/fcm-token', updateFcmToken);
router.get('/saved', getSavedListings);
router.post('/saved/toggle', toggleSaveListing);
router.get('/saved-products', getSavedProducts);
router.post('/saved-products/toggle', toggleSaveProduct);
router.post('/addresses', manageAddressBook);

module.exports = router;
