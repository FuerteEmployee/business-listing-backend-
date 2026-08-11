/**
 * Task 7 data fix: two Areas (Adajan, Vesu) have a city_id pointing at a "Surat" City
 * that was fully deleted by the (now-fixed) cascade-delete bug #18/#19. Zero companies
 * reference either area, so this only needs a City recreated and both areas repointed.
 *
 * Confirmed via read-only checks before writing:
 * - No City named "Surat" exists anywhere in the collection.
 * - Gujarat state_id 69b52ee31704ef2950d9dfd4 confirmed present.
 * - Pincodes 395007/395009 on the two areas both resolve to Surat, Gujarat.
 *
 * Run:  node scripts/fix-orphaned-surat-areas.js
 * Add --dry-run to report the exact writes without making them.
 */
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
dns.setServers(['8.8.8.8', '8.8.4.4']);

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const City = require('../models/City');
const Area = require('../models/Area');
const State = require('../models/State');

const DRY_RUN = process.argv.includes('--dry-run');
const ORPHAN_CITY_ID = '69b52ee31704ef2950d9dfdd'; // the missing city_id both areas still point at

(async () => {
    if (!process.env.MONGO_URI) throw new Error('MONGO_URI is not set');
    await mongoose.connect(process.env.MONGO_URI);
    console.log(`Connected.${DRY_RUN ? '  [DRY RUN]' : ''}\n`);

    const gujarat = await State.findOne({ name: /gujarat/i });
    if (!gujarat) throw new Error('Gujarat state not found - aborting');

    const existingSurat = await City.findOne({ state_id: gujarat._id, name: /^surat$/i });
    if (existingSurat) {
        console.log(`Surat already exists (id=${existingSurat._id}) - nothing to create, will just repoint areas.`);
    }

    const orphanAreas = await Area.find({ city_id: ORPHAN_CITY_ID });
    console.log(`Areas currently pointing at the missing city (${ORPHAN_CITY_ID}):`, orphanAreas.map(a => a.name));

    if (orphanAreas.length === 0) {
        console.log('Nothing to do - no areas reference the missing city anymore.');
        await mongoose.disconnect();
        return;
    }

    if (DRY_RUN) {
        console.log(`\n[DRY-RUN] Would ${existingSurat ? 'reuse' : 'create'} City "Surat" under Gujarat (${gujarat._id}),`);
        console.log(`[DRY-RUN] then set city_id -> Surat._id on: ${orphanAreas.map(a => a.name).join(', ')}`);
        await mongoose.disconnect();
        return;
    }

    const surat = existingSurat || await City.create({
        state_id: gujarat._id,
        name: 'Surat',
        slug: 'surat',
        status: 'Active'
    });
    console.log(`Surat city ready: id=${surat._id}`);

    const res = await Area.updateMany(
        { city_id: ORPHAN_CITY_ID },
        { $set: { city_id: surat._id } }
    );
    console.log(`Repointed ${res.modifiedCount} area(s) to the new Surat city.`);

    await mongoose.disconnect();
})().catch(err => {
    console.error('Fix failed:', err.message);
    process.exit(1);
});
