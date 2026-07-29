const ClaimRequest = require('../models/ClaimRequest');
const Company = require('../models/Company');
const User = require('../models/User');

// @desc    Create a new claim request
// @route   POST /api/claims
const createClaimRequest = async (req, res) => {
    try {
        const { companyId, fullName, businessEmail, phoneNumber, position, message, documents } = req.body;

        // Check if company exists
        const company = await Company.findById(companyId);
        if (!company) {
            return res.status(404).json({ msg: 'Company not found' });
        }

        // Check if already claimed
        if (company.claimed) {
            return res.status(400).json({ msg: 'This company is already claimed' });
        }

        // Check if a request is already pending for this company by this user
        const existingRequest = await ClaimRequest.findOne({ 
            companyId, 
            userId: req.user._id, 
            status: 'Pending' 
        });
        if (existingRequest) {
            return res.status(400).json({ msg: 'You already have a pending claim request for this business' });
        }

        const newRequest = new ClaimRequest({
            companyId,
            userId: req.user._id,
            fullName,
            businessEmail,
            phoneNumber,
            position,
            message,
            documents
        });

        await newRequest.save();

        // Mark company as having a pending claim
        company.isClaimPending = true;
        await company.save();

        res.status(201).json({
            success: true,
            msg: 'Claim request submitted successfully. Admin will review it shortly.',
            data: newRequest
        });
    } catch (err) {
        console.error('Create Claim Request Error:', err.message);
        res.status(500).json({ msg: 'Server Error', error: err.message });
    }
};

// @desc    Get all claim requests (Admin only)
// @route   GET /api/claims
const getAllClaimRequests = async (req, res) => {
    try {
        const requests = await ClaimRequest.find()
            .populate('companyId', 'name slug address city_id state_id')
            .populate('userId', 'name email role')
            .sort({ createdAt: -1 });

        res.json(requests);
    } catch (err) {
        console.error('Get Claim Requests Error:', err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
};

// @desc    Update claim request status (Accept/Reject)
// @route   PUT /api/claims/:id
const updateClaimStatus = async (req, res) => {
    try {
        const { status, adminComment } = req.body;
        const claimRequest = await ClaimRequest.findById(req.params.id);

        if (!claimRequest) {
            return res.status(404).json({ msg: 'Claim request not found' });
        }

        if (claimRequest.status !== 'Pending') {
            return res.status(400).json({ msg: 'This request has already been processed' });
        }

        claimRequest.status = status;
        claimRequest.adminComment = adminComment;

        // If accepted, update the company
        if (status === 'Accepted') {
            const company = await Company.findById(claimRequest.companyId);
            if (company) {
                company.claimed = true;
                company.owner = claimRequest.userId;
                company.isClaimPending = false;
                await company.save();

                // Upgrade user role if necessary
                const user = await User.findById(claimRequest.userId);
                if (user && user.role === 'User') {
                    user.role = 'Brand Owner';
                    await user.save();
                }
            }
        } else if (status === 'Rejected') {
            const company = await Company.findById(claimRequest.companyId);
            if (company) {
                // Check if there are other pending requests for this company
                const otherRequests = await ClaimRequest.find({ 
                    companyId: company._id, 
                    _id: { $ne: claimRequest._id },
                    status: 'Pending' 
                });
                if (otherRequests.length === 0) {
                    company.isClaimPending = false;
                    await company.save();
                }
            }
        }

        await claimRequest.save();

        res.json({
            success: true,
            msg: `Claim request ${status.toLowerCase()} successfully`,
            data: claimRequest
        });
    } catch (err) {
        console.error('Update Claim Status Error:', err.message);
        res.status(500).json({ msg: 'Server Error', error: err.message });
    }
};

// @desc    Get user's own claim requests
// @route   GET /api/claims/my-requests
const getMyClaimRequests = async (req, res) => {
    try {
        const requests = await ClaimRequest.find({ userId: req.user._id })
            .populate('companyId', 'name slug address')
            .sort({ createdAt: -1 });

        res.json(requests);
    } catch (err) {
        console.error('Get My Claims Error:', err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
};

module.exports = {
    createClaimRequest,
    getAllClaimRequests,
    updateClaimStatus,
    getMyClaimRequests
};
