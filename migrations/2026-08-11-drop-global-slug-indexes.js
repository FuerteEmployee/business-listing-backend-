/**
 * Bug #20 migration: drop the obsolete global-unique `slug_1` indexes on cities and areas.
 *
 * The schemas now scope slug uniqueness to the parent ({state_id, slug} / {city_id, slug}),
 * and Mongoose has already created those compound indexes. But Mongoose never DROPS an index
 * it no longer declares, so the old global `slug_1` unique index survives in MongoDB and keeps
 * rejecting legitimate duplicates - e.g. an area named "MG Road" in a second city, which also
 * breaks listing creation via the manual-location path in companyController.
 *
 * This drops only those two indexes. It touches no documents.
 * Reversible: db.cities.createIndex({slug: 1}, {unique: true}) restores the old behaviour.
 *
 * Run:  node migrations/2026-08-11-drop-global-slug-indexes.js
 * Add --dry-run to report what it would do without changing anything.
 */
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
dns.setServers(['8.8.8.8', '8.8.4.4']);

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

const DRY_RUN = process.argv.includes('--dry-run');
const TARGETS = [
    { collection: 'cities', index: 'slug_1', replacedBy: 'state_id_1_slug_1' },
    { collection: 'areas', index: 'slug_1', replacedBy: 'city_id_1_slug_1' }
];

(async () => {
    if (!process.env.MONGO_URI) throw new Error('MONGO_URI is not set');
    await mongoose.connect(process.env.MONGO_URI);
    console.log(`Connected.${DRY_RUN ? '  [DRY RUN - no changes will be made]' : ''}\n`);

    for (const { collection, index, replacedBy } of TARGETS) {
        const coll = mongoose.connection.db.collection(collection);
        const existing = await coll.indexes();
        const names = existing.map(i => i.name);

        if (!names.includes(index)) {
            console.log(`${collection}: "${index}" already absent - nothing to do.`);
            continue;
        }

        // Refuse to drop the old guard unless its scoped replacement is confirmed present,
        // otherwise there would be a window with no uniqueness protection at all.
        if (!names.includes(replacedBy)) {
            console.log(`${collection}: SKIPPED - replacement index "${replacedBy}" not found. ` +
                `Start the backend once so Mongoose builds it, then re-run.`);
            continue;
        }

        if (DRY_RUN) {
            console.log(`${collection}: would drop "${index}" (replacement "${replacedBy}" confirmed present).`);
            continue;
        }

        await coll.dropIndex(index);
        console.log(`${collection}: dropped "${index}".`);
    }

    console.log('\nFinal state:');
    for (const { collection } of TARGETS) {
        const idx = await mongoose.connection.db.collection(collection).indexes();
        console.log(`  ${collection}: ${idx.map(i => i.name).join(', ')}`);
    }

    await mongoose.disconnect();
})().catch(err => {
    console.error('Migration failed:', err.message);
    process.exit(1);
});
