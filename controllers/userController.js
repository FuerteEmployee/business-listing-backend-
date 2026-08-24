const User = require('../models/User');
const bcrypt = require('bcryptjs');

// @desc    Get all users
// @route   GET /api/users
const getAllUsers = async (req, res) => {
    try {
        const query = {};
        if (req.query.role) query.role = req.query.role;
        const users = await User.find(query).sort({ createdAt: -1 }).select('-password');
        res.json({ success: true, users });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ success: false, msg: 'Server Error' });
    }
};

// @desc    Create a new user
// @route   POST /api/users
const createUser = async (req, res) => {
    try {
        const { email, password } = req.body;
        let user = await User.findOne({ email });
        if (user) {
            return res.status(400).json({ msg: 'User already exists' });
        }

        const newUser = { ...req.body };
        // If an admin provides a password, hash it. Otherwise, generate a random one
        const rawPassword = password || Math.random().toString(36).slice(-8);
        const salt = await bcrypt.genSalt(10);
        newUser.password = await bcrypt.hash(rawPassword, salt);

        user = new User(newUser);
        await user.save();
        res.status(201).json(user);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
};

// @desc    Update a user
// @route   PUT /api/users/:id
const updateUser = async (req, res) => {
    try {
        let user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ msg: 'User not found' });

        const updateData = { ...req.body };

        // If password is being updated, hash the new password
        if (updateData.password) {
            const salt = await bcrypt.genSalt(10);
            updateData.password = await bcrypt.hash(updateData.password, salt);
        }

        const originalUser = {
            name: user.name,
            email: user.email,
            role: user.role,
            status: user.status
        };

        user = await User.findByIdAndUpdate(
            req.params.id,
            { $set: updateData },
            { new: true }
        );

        // Log to AdminAuditLog if password or profile changed
        try {
            const AdminAuditLog = require('../models/AdminAuditLog');
            if (updateData.password) {
                await AdminAuditLog.create({
                    adminId: req.user.id,
                    action: 'USER_PASSWORD_CHANGED',
                    targetType: 'User',
                    targetId: user._id,
                    ipAddress: req.ip,
                    userAgent: req.headers['user-agent'],
                    notes: `Admin changed password for user ${user.name}`
                });
            }
            // Log user profile update if fields changed
            const fieldChanged = [];
            ['email', 'name', 'role', 'status'].forEach(f => {
                if (updateData[f] !== undefined && String(updateData[f]) !== String(originalUser[f])) {
                    fieldChanged.push(f);
                }
            });
            if (fieldChanged.length > 0) {
                await AdminAuditLog.create({
                    adminId: req.user.id,
                    action: 'USER_PROFILE_UPDATED',
                    targetType: 'User',
                    targetId: user._id,
                    changes: {
                        before: fieldChanged.reduce((acc, f) => ({ ...acc, [f]: originalUser[f] }), {}),
                        after: fieldChanged.reduce((acc, f) => ({ ...acc, [f]: updateData[f] }), {}),
                        fieldChanged
                    },
                    ipAddress: req.ip,
                    userAgent: req.headers['user-agent'],
                    notes: `Admin updated fields [${fieldChanged.join(', ')}] for user ${user.name}`
                });
            }
        } catch (auditErr) {
            console.error('Failed to log admin user update audit:', auditErr.message);
        }

        res.json(user);
    } catch (err) {
        console.error(err.message);
        if (err.kind === 'ObjectId') return res.status(404).json({ msg: 'User not found' });
        res.status(500).json({ msg: 'Server Error' });
    }
};

// @desc    Delete a user
// @route   DELETE /api/users/:id
const deleteUser = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ msg: 'User not found' });

        await User.findByIdAndDelete(req.params.id);
        res.json({ msg: 'User removed' });
    } catch (err) {
        console.error(err.message);
        if (err.kind === 'ObjectId') return res.status(404).json({ msg: 'User not found' });
        res.status(500).json({ msg: 'Server Error' });
    }
};

module.exports = { getAllUsers, createUser, updateUser, deleteUser };
