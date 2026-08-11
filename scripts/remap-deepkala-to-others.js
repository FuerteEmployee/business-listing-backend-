/**
 * Task 6 follow-up: "DEEPKALA ENGINEERING WORKS" is not a real category - it's a broken
 * import catch-all (25/28 of its companies also have that exact string as their legacy
 * free-text `category`, meaning the import failed to match a real category and fell
 * back to naming the bucket after whichever company hit the bug first).
 *
 * User-approved fix: move all 28 listings to the real "Others" category, then delete
 * the fake one. Individual listings can be recategorized later via the admin panel -
 * this just removes the fake category from view immediately.
 *
 * Run:  node scripts/remap-deepkala-to-others.js
 * Add --dry-run to report the exact writes without making them.
 */
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
dns.setServers(['8.8.8.8', '8.8.4.4']);

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const Category = require('../models/Category');
const Company = require('../models/Company');

const DRY_RUN = process.argv.includes('--dry-run');

(async () => {
    if (!process.env.MONGO_URI) throw new Error('MONGO_URI is not set');
    await mongoose.connect(process.env.MONGO_URI);
    console.log(`Connected.${DRY_RUN ? '  [DRY RUN]' : ''}\n`);

    const deepkala = await Category.findOne({ name: 'DEEPKALA ENGINEERING WORKS' });
    if (!deepkala) {
        console.log('DEEPKALA ENGINEERING WORKS category not found - nothing to do (already cleaned up?).');
        await mongoose.disconnect();
        return;
    }

    const others = await Category.findOne({ name: 'Others', parent: null });
    if (!others) throw new Error('"Others" category not found - aborting, nothing to remap onto');

    const affected = await Company.find({ category_id: deepkala._id }).select('name');
    console.log(`Listings currently under DEEPKALA: ${affected.length}`);
    affected.forEach(c => console.log('  -', c.name));

    if (DRY_RUN) {
        console.log(`\n[DRY-RUN] Would set category_id -> "Others" (${others._id}) on ${affected.length} listings,`);
        console.log(`[DRY-RUN] then delete the "DEEPKALA ENGINEERING WORKS" category (${deepkala._id}).`);
        await mongoose.disconnect();
        return;
    }

    const moveRes = await Company.updateMany(
        { category_id: deepkala._id },
        { $set: { category_id: others._id } }
    );
    console.log(`\nMoved ${moveRes.modifiedCount} listings to "Others".`);

    // Others' subCount is a live-recomputed field elsewhere (bug #23's syncSubCount) but
    // this script writes directly to the DB, so recompute it here too rather than leave
    // it stale until the next unrelated category edit touches it.
    const newCount = await Category.countDocuments({ parent: others._id });
    await Category.findByIdAndUpdate(others._id, { $set: { subCount: newCount } });

    await Category.findByIdAndDelete(deepkala._id);
    console.log('Deleted the "DEEPKALA ENGINEERING WORKS" category.');

    const remaining = await Company.countDocuments({ category_id: deepkala._id });
    console.log(`Listings still pointing at the deleted category (should be 0): ${remaining}`);

    await mongoose.disconnect();
})().catch(err => {
    console.error('Remap failed:', err.message);
    process.exit(1);
});
