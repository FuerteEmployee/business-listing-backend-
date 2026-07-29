const RBACRole = require('../models/RBACRole');
const User = require('../models/User');
const AdminAuditLog = require('../models/AdminAuditLog');

// ==================== ROLE MANAGEMENT ====================

// @desc    Get all roles (built-in + custom)
// @route   GET /api/admin/roles
exports.getAllRoles = async (req, res) => {
    try {
        const roles = await RBACRole.find();

        res.json({
            success: true,
            roles,
            total: roles.length
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// @desc    Get role detail
// @route   GET /api/admin/roles/:id
exports.getRoleDetail = async (req, res) => {
    try {
        const role = await RBACRole.findById(req.params.id);

        if (!role) {
            return res.status(404).json({ success: false, msg: 'Role not found' });
        }

        res.json({ success: true, role });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// @desc    Create custom role (clone from existing)
// @route   POST /api/admin/roles
// @body    { name, description, baseRole, permissions }
exports.createRole = async (req, res) => {
    try {
        const { name, description, baseRole, permissions } = req.body;

        if (!name) {
            return res.status(400).json({ success: false, msg: 'Role name is required' });
        }

        // Check if role already exists
        const existingRole = await RBACRole.findOne({ name });
        if (existingRole) {
            return res.status(400).json({ success: false, msg: 'Role already exists' });
        }

        // Get base role permissions if specified
        let basePermissions = {
            userManagement: { read: false, write: false, delete: false },
            listingManagement: { read: false, write: false, delete: false, approve: false },
            reviewModeration: { read: false, write: false, delete: false, approve: false },
            roleManagement: { read: false, write: false, delete: false },
            adminManagement: { read: false, write: false, delete: false },
            auditLog: { read: false },
            analytics: { read: false },
            messaging: { read: false, write: false },
            impersonation: { execute: false },
            cmsManagement: { read: false, write: false, delete: false, approve: false },
            visualManagement: { read: false, write: false, delete: false },
            seoManagement: { read: false, write: false, delete: false },
            reporting: { read: false, export: false }
        };

        if (baseRole) {
            const base = await RBACRole.findOne({ name: baseRole });
            if (base) {
                basePermissions = base.permissions;
            }
        }

        const role = new RBACRole({
            name,
            description,
            permissions: permissions || basePermissions,
            isBuiltIn: false
        });

        await role.save();

        // Log audit
        await AdminAuditLog.create({
            adminId: req.user._id,
            action: 'ROLE_CREATED',
            targetType: 'Role',
            targetId: role._id,
            notes: `Custom role created: ${name}`
        });

        res.status(201).json({ success: true, msg: 'Role created successfully', role });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// @desc    Update role permissions
// @route   PUT /api/admin/roles/:id
// @body    { permissions }
exports.updateRole = async (req, res) => {
    try {
        const { permissions } = req.body;

        const role = await RBACRole.findById(req.params.id);
        if (!role) {
            return res.status(404).json({ success: false, msg: 'Role not found' });
        }

        // Built-in roles cannot be modified (except super admin can override)
        if (role.isBuiltIn && req.user.role !== 'Super Admin') {
            return res.status(403).json({ success: false, msg: 'Built-in roles cannot be modified' });
        }

        const oldPermissions = role.permissions;
        role.permissions = permissions || role.permissions;
        await role.save();

        // Log audit
        await AdminAuditLog.create({
            adminId: req.user._id,
            action: 'ROLE_UPDATED',
            targetType: 'Role',
            targetId: role._id,
            changes: {
                before: oldPermissions,
                after: role.permissions
            },
            notes: `Role permissions updated: ${role.name}`
        });

        res.json({ success: true, msg: 'Role updated successfully', role });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// @desc    Delete custom role
// @route   DELETE /api/admin/roles/:id
exports.deleteRole = async (req, res) => {
    try {
        const role = await RBACRole.findById(req.params.id);
        if (!role) {
            return res.status(404).json({ success: false, msg: 'Role not found' });
        }

        // Cannot delete built-in roles
        if (role.isBuiltIn) {
            return res.status(403).json({ success: false, msg: 'Built-in roles cannot be deleted' });
        }

        // Check if any users have this role
        const usersWithRole = await User.countDocuments({ role: role.name });
        if (usersWithRole > 0) {
            return res.status(400).json({
                success: false,
                msg: `Cannot delete role. ${usersWithRole} users have this role.`
            });
        }

        await RBACRole.findByIdAndDelete(req.params.id);

        // Log audit
        await AdminAuditLog.create({
            adminId: req.user._id,
            action: 'ROLE_DELETED',
            targetType: 'Role',
            targetId: req.params.id,
            notes: `Role deleted: ${role.name}`
        });

        res.json({ success: true, msg: 'Role deleted successfully' });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};
