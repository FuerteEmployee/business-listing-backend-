/**
 * Task 6 data fix: delete the confirmed-pollution Category documents.
 *
 * Criteria (matches the audit already reviewed by the user):
 *   - created between 2026-07-29 and 2026-08-01 (the anomalous import batch)
 *   - zero Companies reference it via category_id (re-verified live, not from the
 *     earlier audit snapshot, in case anything changed since)
 *   - not the parent of any other category (would orphan children otherwise)
 *
 * This intentionally does NOT touch:
 *   - the 31 genuine categories from the 2026-04-10 batch
 *   - any category with real listings attached (e.g. "Machinery & Tools",
 *     "DEEPKALA ENGINEERING WORKS" - handled separately, on purpose)
 *
 * Run:  node scripts/cleanup-pollution-categories.js
 * Add --dry-run to list exactly what would be deleted without deleting anything.
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
const BATCH_START = new Date('2026-07-29T00:00:00Z');
const BATCH_END = new Date('2026-08-01T00:00:00Z');

(async () => {
    if (!process.env.MONGO_URI) throw new Error('MONGO_URI is not set');
    await mongoose.connect(process.env.MONGO_URI);
    console.log(`Connected.${DRY_RUN ? '  [DRY RUN]' : ''}\n`);

    const batchCats = await Category.find({ createdAt: { $gte: BATCH_START, $lt: BATCH_END } });
    console.log(`Categories in the suspect batch: ${batchCats.length}`);

    const parentIds = new Set(
        (await Category.find({ parent: { $ne: null } }).select('parent')).map(c => c.parent.toString())
    );

    const toDelete = [];
    const skipped = [];
    for (const c of batchCats) {
        const usage = await Company.countDocuments({ category_id: c._id });
        const isParent = parentIds.has(c._id.toString());
        if (usage === 0 && !isParent) {
            toDelete.push(c);
        } else {
            skipped.push({ name: c.name, usage, isParent });
        }
    }

    console.log(`Confirmed deletable (0 usage, not a parent): ${toDelete.length}`);
    console.log(`Skipped (has usage or is a parent - left alone): ${skipped.length}`);
    if (skipped.length) {
        console.log('Skipped list:', skipped.map(s => `${s.name} (usage=${s.usage}${s.isParent ? ', is-parent' : ''})`).join(', '));
    }

    if (DRY_RUN) {
        console.log(`\n[DRY-RUN] Would delete ${toDelete.length} categories:`);
        toDelete.forEach(c => console.log('  -', c.name));
        await mongoose.disconnect();
        return;
    }

    const ids = toDelete.map(c => c._id);
    const res = await Category.deleteMany({ _id: { $in: ids } });
    console.log(`\nDeleted ${res.deletedCount} pollution categories.`);

    const remaining = await Category.countDocuments();
    console.log(`Categories remaining in the collection: ${remaining}`);

    await mongoose.disconnect();
})().catch(err => {
    console.error('Cleanup failed:', err.message);
    process.exit(1);
});
