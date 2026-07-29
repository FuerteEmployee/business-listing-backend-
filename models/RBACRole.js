const mongoose = require('mongoose');

const rbacRoleSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    description: String,
    // Built-in roles cannot be modified
    isBuiltIn: {
        type: Boolean,
        default: true
    },
    // Permission matrix: module-level read/write/delete
    permissions: {
        userManagement: {
            read: { type: Boolean },
            write: { type: Boolean },
            delete: { type: Boolean }
        },
        listingManagement: {
            read: { type: Boolean },
            write: { type: Boolean },
            delete: { type: Boolean },
            approve: { type: Boolean }
        },
        reviewModeration: {
            read: { type: Boolean },
            write: { type: Boolean },
            delete: { type: Boolean },
            approve: { type: Boolean }
        },
        roleManagement: {
            read: { type: Boolean },
            write: { type: Boolean },
            delete: { type: Boolean }
        },
        adminManagement: {
            read: { type: Boolean },
            write: { type: Boolean },
            delete: { type: Boolean }
        },
        auditLog: {
            read: { type: Boolean }
        },
        analytics: {
            read: { type: Boolean }
        },
        messaging: {
            read: { type: Boolean },
            write: { type: Boolean }
        },
        impersonation: {
            execute: { type: Boolean }
        },
        cmsManagement: {
            read: { type: Boolean },
            write: { type: Boolean },
            delete: { type: Boolean },
            approve: { type: Boolean }
        },
        visualManagement: {
            read: { type: Boolean },
            write: { type: Boolean },
            delete: { type: Boolean }
        },
        seoManagement: {
            read: { type: Boolean },
            write: { type: Boolean },
            delete: { type: Boolean }
        },
        reporting: {
            read: { type: Boolean },
            export: { type: Boolean }
        }
    }
}, { timestamps: true });

// Predefined roles with default permissions (static data, not part of schema)
const defaultPermissions = {
    'Super Admin': { // Full access
        userManagement: { read: true, write: true, delete: true },
        listingManagement: { read: true, write: true, delete: true, approve: true },
        reviewModeration: { read: true, write: true, delete: true, approve: true },
        roleManagement: { read: true, write: true, delete: true },
        adminManagement: { read: true, write: true, delete: true },
        auditLog: { read: true },
        analytics: { read: true },
        messaging: { read: true, write: true },
        impersonation: { execute: true },
        cmsManagement: { read: true, write: true, delete: true, approve: true },
        visualManagement: { read: true, write: true, delete: true },
        seoManagement: { read: true, write: true, delete: true },
        reporting: { read: true, export: true }
    },
    'Admin': { // Can manage users and listings
        userManagement: { read: true, write: true, delete: false },
        listingManagement: { read: true, write: true, delete: true, approve: true },
        reviewModeration: { read: true, write: true, delete: false, approve: true },
        roleManagement: { read: true, write: false, delete: false },
        adminManagement: { read: true, write: false, delete: false },
        auditLog: { read: true },
        analytics: { read: true },
        messaging: { read: true, write: true },
        impersonation: { execute: false },
        cmsManagement: { read: true, write: true, delete: false, approve: true },
        visualManagement: { read: true, write: true, delete: false },
        seoManagement: { read: true, write: true, delete: false },
        reporting: { read: true, export: true }
    },
    'Moderator': { // Can moderate reviews and content
        userManagement: { read: true, write: false, delete: false },
        listingManagement: { read: true, write: false, delete: false, approve: false },
        reviewModeration: { read: true, write: true, delete: false, approve: true },
        roleManagement: { read: false, write: false, delete: false },
        adminManagement: { read: false, write: false, delete: false },
        auditLog: { read: true },
        analytics: { read: false },
        messaging: { read: true, write: true },
        impersonation: { execute: false },
        cmsManagement: { read: true, write: false, delete: false, approve: true },
        visualManagement: { read: true, write: false, delete: false },
        seoManagement: { read: true, write: false, delete: false }
    },
    'Finance': { // Can view analytics and reports
        userManagement: { read: true, write: false, delete: false },
        listingManagement: { read: true, write: false, delete: false, approve: false },
        reviewModeration: { read: true, write: false, delete: false, approve: false },
        roleManagement: { read: false, write: false, delete: false },
        adminManagement: { read: false, write: false, delete: false },
        auditLog: { read: true },
        analytics: { read: true },
        messaging: { read: false, write: false },
        impersonation: { execute: false },
        cmsManagement: { read: true, write: false, delete: false, approve: false },
        visualManagement: { read: true, write: false, delete: false },
        seoManagement: { read: true, write: false, delete: false }
    },
    'Support': { // Can view and message users
        userManagement: { read: true, write: false, delete: false },
        listingManagement: { read: true, write: false, delete: false, approve: false },
        reviewModeration: { read: true, write: false, delete: false, approve: false },
        roleManagement: { read: false, write: false, delete: false },
        adminManagement: { read: false, write: false, delete: false },
        auditLog: { read: true },
        analytics: { read: false },
        messaging: { read: true, write: true },
        impersonation: { execute: false },
        cmsManagement: { read: true, write: false, delete: false, approve: false },
        visualManagement: { read: true, write: false, delete: false },
        seoManagement: { read: true, write: false, delete: false }
    },
    'Viewer': { // Read-only access
        userManagement: { read: true, write: false, delete: false },
        listingManagement: { read: true, write: false, delete: false, approve: false },
        reviewModeration: { read: true, write: false, delete: false, approve: false },
        roleManagement: { read: false, write: false, delete: false },
        adminManagement: { read: false, write: false, delete: false },
        auditLog: { read: true },
        analytics: { read: true },
        messaging: { read: false, write: false },
        impersonation: { execute: false },
        cmsManagement: { read: true, write: false, delete: false, approve: false },
        visualManagement: { read: true, write: false, delete: false },
        seoManagement: { read: true, write: false, delete: false }
    }
};

const RBACRole = mongoose.model('RBACRole', rbacRoleSchema);

// Add default permissions as a static property
RBACRole.defaultPermissions = defaultPermissions;

module.exports = RBACRole;
