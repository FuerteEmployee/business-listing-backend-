/**
 * Merchant removal migration: the app now has only Brand Owner and User (plus admin roles).
 *
 * 1. users:         role 'Merchant', 'Company Owner', 'owner' (any spelling/case) -> 'Brand Owner'.
 *                   The app has three kinds of account: admin, Brand Owner and User. 'Merchant'
 *                   is no longer recognised at all, so without this those accounts lose /brand.
 * 2. systemconfigs: panel 'merchant'     -> 'brand'. The panel key was renamed; an existing
 *                   'merchant' doc would otherwise fail the schema enum and its hidden-feature
 *                   settings would be ignored.
 * 3. notifications: links pointing at the removed /merchant/... pages -> /brand/... .
 * 4. orders:        reported only. The Order model and merchant order module were deleted;
 *                   the collection is left in place so no data is destroyed.
 *
 * Reversible: the ids of every changed user are printed, so the old role can be restored.
 *
 * Run:  node migrations/2026-10-05-remove-merchant-role.js
 * Add --dry-run to report what it would do without changing anything.
 */
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
dns.setServers(['8.8.8.8', '8.8.4.4']);

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

const DRY_RUN = process.argv.includes('--dry-run');

(async () => {
    if (!process.env.MONGO_URI) throw new Error('MONGO_URI is not set');
    await mongoose.connect(process.env.MONGO_URI);
    console.log(`Connected.${DRY_RUN ? '  [DRY RUN - no changes will be made]' : ''}\n`);
    const db = mongoose.connection.db;

    // 1. Users - every legacy brand-role spelling, matched case-insensitively
    const users = db.collection('users');
    const legacyRole = { role: { $regex: /^\s*(merchant|company owner|owner)\s*$/i } };
    const legacy = await users.find(legacyRole).project({ _id: 1, email: 1, role: 1 }).toArray();
    console.log(`users: ${legacy.length} with a legacy brand role`);
    legacy.forEach(u => console.log(`  ${u._id}  ${u.role}  ${u.email || ''}`));
    if (legacy.length && !DRY_RUN) {
        const r = await users.updateMany(legacyRole, { $set: { role: 'Brand Owner' } });
        console.log(`users: updated ${r.modifiedCount} -> 'Brand Owner'`);
    }

    // 2. System config panel key
    const configs = db.collection('systemconfigs');
    const oldPanel = await configs.findOne({ panel: 'merchant' });
    const newPanel = await configs.findOne({ panel: 'brand' });
    if (oldPanel) {
        // These start applying to the brand panel once renamed - check they are still wanted
        console.log(`
systemconfigs: 'merchant' doc hides: ${JSON.stringify(oldPanel.hiddenFeatures || [])}`);
    }
    if (!oldPanel) {
        console.log(`\nsystemconfigs: no 'merchant' panel - nothing to do.`);
    } else if (newPanel) {
        // panel is unique; don't overwrite a 'brand' doc that was created in the meantime
        console.log(`\nsystemconfigs: SKIPPED - both 'merchant' and 'brand' docs exist. Review manually.`);
    } else if (DRY_RUN) {
        console.log(`\nsystemconfigs: would rename panel 'merchant' -> 'brand'.`);
    } else {
        await configs.updateOne({ _id: oldPanel._id }, { $set: { panel: 'brand' } });
        console.log(`\nsystemconfigs: renamed panel 'merchant' -> 'brand'.`);
    }

    // 3. Notification links to removed /merchant pages
    const notifications = db.collection('notifications');
    const oldLinks = { link: { $regex: /^\/merchant\// } };
    const linkCount = await notifications.countDocuments(oldLinks);
    console.log(`
notifications: ${linkCount} link(s) to /merchant/...`);
    if (linkCount && !DRY_RUN) {
        // /merchant/leads/<id> pointed at an enquiry id, which has no brand page - use the list
        await notifications.updateMany({ link: { $regex: /^\/merchant\/leads\// } }, { $set: { link: '/brand/leads' } });
        const r = await notifications.updateMany(oldLinks, [
            { $set: { link: { $concat: ['/brand/', { $substrCP: ['$link', 10, 1000] }] } } }
        ]);
        console.log(`notifications: rewrote ${r.modifiedCount} remaining link(s) -> /brand/...`);
    }

    // 4. Orphaned orders collection (report only)
    const collections = (await db.listCollections({ name: 'orders' }).toArray()).length;
    if (collections) {
        const count = await db.collection('orders').countDocuments();
        console.log(`\norders: collection still holds ${count} document(s); left untouched (no code uses it now).`);
    }

    await mongoose.disconnect();
})().catch(err => {
    console.error('Migration failed:', err.message);
    process.exit(1);
});
