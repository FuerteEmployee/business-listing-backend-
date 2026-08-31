/**
 * Seeds every State and City of India into the location tables, so the
 * Country > State > City > Area dropdowns (admin Create/Edit Listing, admin
 * Locations, merchant profile, public search) cover the whole country instead of
 * only the handful of hand-seeded rows.
 *
 * Result for India: 36 states/UTs and 7,873 cities.
 *
 * Two datasets are merged, because neither alone is complete:
 * - `country-state-city` (4,242 India cities) - authoritative state list with ISO
 *   codes and plain-ASCII city names, but its data snapshot is from Sept 2023.
 * - `cities.json` (7,059 India rows, GeoNames Gazetteer, refreshed Aug 2026) - 3,637
 *   cities the first dataset is missing, but it labels each row with a numeric
 *   GeoNames `admin1` code rather than a state name, and its names carry diacritics.
 *
 * Only India is seeded. Passing --country=<other ISO2> uses the `country-state-city`
 * dataset alone, since the ADMIN1_TO_STATE table below is India-specific.
 *
 * Additive only - it never deletes or repoints anything:
 * - Existing States/Cities are matched by a normalised name key ("Tamilnadu" matches
 *   "Tamil Nadu"), so their _id is reused and every Company/Area/Lead already
 *   pointing at them keeps resolving. Only the display name is normalised.
 * - Cities already in the DB are left untouched (slug, isPopular, order, boundary, meta).
 * - Rows neither dataset has a match for (e.g. the "Vadodra" typo of Vadodara) are
 *   reported at the end rather than removed - merging those is a manual call.
 *
 * Public city pickers (HomePage, SearchPage, CategoriesPage) request
 * GET /locations/cities with no state_id, which the controller caps at 50 sorted by
 * `isPopular desc, order, name`. Seeding thousands of cities would push today's
 * visible cities out of that window, so on a first seed the script flags the
 * pre-existing cities as isPopular to keep those pages showing what they show now.
 *
 * Run:  node scripts/seed-all-states-cities.js
 *       npm run seed:locations
 *       node scripts/seed-all-states-cities.js --dry-run       report writes, make none
 *       node scripts/seed-all-states-cities.js --no-preserve-popular
 */
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
dns.setServers(['8.8.8.8', '8.8.4.4']);

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const csc = require('country-state-city');
const geonames = require('cities.json');

const Country = require('../models/Country');
const State = require('../models/State');
const City = require('../models/City');

const DRY_RUN = process.argv.includes('--dry-run');
const PRESERVE_POPULAR = !process.argv.includes('--no-preserve-popular');
const COUNTRY_CODE = (process.argv.find(a => a.startsWith('--country='))?.split('=')[1] || 'IN').toUpperCase();

/**
 * GeoNames admin1 code -> Indian state name.
 *
 * Derived from the data rather than typed from memory: every India row in
 * cities.json was matched to its geographically nearest `country-state-city` city
 * (which carries a real state name), then each admin1 code took the majority vote
 * of its rows' states. The result is self-consistent - 36 codes resolved to 36
 * distinct states with no state left unassigned - and 34 of the 36 codes won with
 * >=86% of their vote. The two lowest (41 Ladakh at 67% of 6 rows, 22 Puducherry at
 * 80% of 10 rows) are small sets where border proximity dominates, and both still
 * won. Codes are non-contiguous because several (e.g. 06 Dadra & Nagar Haveli,
 * 32 Daman & Diu) were retired when those UTs merged into 52.
 */
const ADMIN1_TO_STATE = {
    '01': 'Andaman and Nicobar Islands',
    '02': 'Andhra Pradesh',
    '03': 'Assam',
    '05': 'Chandigarh',
    '07': 'Delhi',
    '09': 'Gujarat',
    '10': 'Haryana',
    '11': 'Himachal Pradesh',
    '12': 'Jammu and Kashmir',
    '13': 'Kerala',
    '14': 'Lakshadweep',
    '16': 'Maharashtra',
    '17': 'Manipur',
    '18': 'Meghalaya',
    '19': 'Karnataka',
    '20': 'Nagaland',
    '21': 'Odisha',
    '22': 'Puducherry',
    '23': 'Punjab',
    '24': 'Rajasthan',
    '25': 'Tamil Nadu',
    '26': 'Tripura',
    '28': 'West Bengal',
    '29': 'Sikkim',
    '30': 'Arunachal Pradesh',
    '31': 'Mizoram',
    '33': 'Goa',
    '34': 'Bihar',
    '35': 'Madhya Pradesh',
    '36': 'Uttar Pradesh',
    '37': 'Chhattisgarh',
    '38': 'Jharkhand',
    '39': 'Uttarakhand',
    '40': 'Telangana',
    '41': 'Ladakh',
    '52': 'Dadra and Nagar Haveli and Daman and Diu'
};

// Above this many pre-existing cities the run is not a first seed, so flagging
// everything that predates it as isPopular would be meaningless - skip instead.
const FIRST_SEED_CITY_LIMIT = 50;
const INSERT_CHUNK = 500;

// Mirrors generateSlug in controllers/locationController.js so seeded and
// admin-created cities produce identical slugs.
const generateSlug = (name) => String(name).toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');

// Identity key for matching a row against another dataset or against the DB. Strips
// case, diacritics, spaces, hyphens and punctuation, so "Tamil Nadu"/"Tamilnadu",
// "Raj Nandgaon"/"Raj-Nandgaon" and "Punch"/"Punch" collapse to a single entity
// instead of colliding on the unique state_id+slug index.
const key = (name) => String(name).normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '');

// GeoNames spells names with diacritics ("Punch", "Thane"); the rest of the platform
// is plain ASCII, so fold them. Also trims the punctuation noise both datasets carry
// ("Amod,", "Nadiad,", "Jarod,").
const cleanName = (name) => String(name)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[^\p{L}\p{N}(]+|[^\p{L}\p{N})\.]+$/gu, '')
    .trim();

const uniqueSlug = (name, used) => {
    const base = generateSlug(name) || 'city';
    let slug = base;
    let n = 2;
    while (used.has(slug)) slug = `${base}-${n++}`;
    used.add(slug);
    return slug;
};

/**
 * Merged city list per state name: Map<stateName, Map<key, {name, src}>>.
 * `country-state-city` wins the display name when both datasets have the city.
 */
function buildCityIndex(countryCode, pkgStates) {
    const index = new Map();
    const stats = { csc: 0, geonames: 0, geonamesUnmapped: 0, duplicates: 0 };

    const add = (stateName, rawName, src) => {
        if (!index.has(stateName)) index.set(stateName, new Map());
        const bucket = index.get(stateName);
        const name = cleanName(rawName);
        const k = key(name);
        if (!k) return;
        if (!bucket.has(k)) {
            bucket.set(k, { name, src });
        } else {
            stats.duplicates++;
            if (src === 'csc') bucket.get(k).name = name;
        }
    };

    for (const pkgState of pkgStates) {
        const stateName = cleanName(pkgState.name);
        if (!index.has(stateName)) index.set(stateName, new Map());
        for (const c of csc.City.getCitiesOfState(countryCode, pkgState.isoCode)) {
            add(stateName, c.name, 'csc');
            stats.csc++;
        }
    }

    if (countryCode === 'IN') {
        for (const row of geonames) {
            if (row.country !== 'IN') continue;
            const stateName = ADMIN1_TO_STATE[row.admin1];
            if (!stateName) { stats.geonamesUnmapped++; continue; }
            add(stateName, row.name, 'geonames');
            stats.geonames++;
        }
    }

    return { index, stats };
}

(async () => {
    if (!process.env.MONGO_URI) throw new Error('MONGO_URI is not set');

    const pkgCountry = csc.Country.getCountryByCode(COUNTRY_CODE);
    if (!pkgCountry) throw new Error(`Unknown country code "${COUNTRY_CODE}"`);

    const pkgStates = csc.State.getStatesOfCountry(COUNTRY_CODE);
    if (!pkgStates.length) throw new Error(`No states available for ${COUNTRY_CODE}`);

    const { index: cityIndex, stats } = buildCityIndex(COUNTRY_CODE, pkgStates);
    const unionTotal = [...cityIndex.values()].reduce((s, m) => s + m.size, 0);

    await mongoose.connect(process.env.MONGO_URI);
    console.log(`Connected.${DRY_RUN ? '  [DRY RUN - no writes]' : ''}`);
    console.log(`Country: ${pkgCountry.name} (${COUNTRY_CODE})`);
    console.log(`Sources: country-state-city ${stats.csc} rows` +
        (COUNTRY_CODE === 'IN' ? `, cities.json/GeoNames ${stats.geonames} rows (${stats.geonamesUnmapped} unmapped)` : ' (India-only GeoNames source skipped)'));
    console.log(`Merged:  ${pkgStates.length} states, ${unionTotal} unique cities ` +
        `(${stats.duplicates} cross-dataset duplicates collapsed)\n`);

    // --- Country -------------------------------------------------------------
    let country = await Country.findOne({ code: COUNTRY_CODE });
    if (!country) {
        if (DRY_RUN) {
            console.log(`+ country ${pkgCountry.name} (${COUNTRY_CODE})`);
            console.log('\nDry run stops here: with no country row there is no _id to attach states to.');
            await mongoose.disconnect();
            return;
        }
        country = await Country.create({ name: pkgCountry.name, code: COUNTRY_CODE, status: 'Active' });
        console.log(`+ country ${country.name} (${COUNTRY_CODE})`);
    } else {
        console.log(`= country ${country.name} (${COUNTRY_CODE}) id=${country._id}`);
    }

    // Snapshot what predates this run, for the isPopular decision and the final report.
    const preExistingCities = await City.find().select('_id state_id name').lean();
    const preExistingCityIds = new Set(preExistingCities.map(c => String(c._id)));

    // --- States --------------------------------------------------------------
    const dbStates = await State.find({ country_id: country._id });
    const stateByKey = new Map(dbStates.map(s => [key(s.name), s]));

    let statesCreated = 0, statesRenamed = 0, statesMatched = 0;
    const resolvedStates = []; // { doc: <State|null>, name } - doc is null only in a dry run

    for (const pkgState of pkgStates) {
        const name = cleanName(pkgState.name);
        const existing = stateByKey.get(key(name));

        if (existing) {
            statesMatched++;
            if (existing.name !== name) {
                console.log(`~ state rename "${existing.name}" -> "${name}"  (id kept: ${existing._id})`);
                statesRenamed++;
                if (!DRY_RUN) {
                    existing.name = name;
                    await existing.save();
                }
            }
            resolvedStates.push({ doc: existing, name });
            continue;
        }

        statesCreated++;
        if (DRY_RUN) {
            resolvedStates.push({ doc: null, name });
        } else {
            const created = await State.create({ country_id: country._id, name, status: 'Active' });
            stateByKey.set(key(name), created);
            resolvedStates.push({ doc: created, name });
        }
    }
    console.log(`\nStates: ${statesMatched} matched (${statesRenamed} renamed), ${statesCreated} created\n`);

    // --- Cities --------------------------------------------------------------
    let citiesCreated = 0, citiesMatched = 0, citiesFailed = 0;

    for (const state of resolvedStates) {
        const wanted = cityIndex.get(state.name) ?? new Map();

        const dbCities = state.doc
            ? await City.find({ state_id: state.doc._id }).select('name slug').lean()
            : [];
        const haveKeys = new Set(dbCities.map(c => key(c.name)));
        const usedSlugs = new Set(dbCities.map(c => c.slug));

        const toInsert = [];
        for (const [k, entry] of wanted) {
            if (haveKeys.has(k)) { citiesMatched++; continue; }
            toInsert.push({
                state_id: state.doc?._id ?? null,
                name: entry.name,
                slug: uniqueSlug(entry.name, usedSlugs),
                status: 'Active',
                isPopular: false
            });
        }

        if (!toInsert.length) {
            console.log(`  ${state.name.padEnd(38)} ${String(wanted.size).padStart(4)} merged, nothing new`);
            continue;
        }

        if (DRY_RUN) {
            citiesCreated += toInsert.length;
        } else {
            for (let i = 0; i < toInsert.length; i += INSERT_CHUNK) {
                const chunk = toInsert.slice(i, i + INSERT_CHUNK);
                try {
                    const res = await City.insertMany(chunk, { ordered: false });
                    citiesCreated += res.length;
                } catch (err) {
                    // ordered:false keeps going past dupes; count what landed vs what did not.
                    const failed = err.writeErrors?.length ?? chunk.length;
                    citiesCreated += chunk.length - failed;
                    citiesFailed += failed;
                    for (const we of (err.writeErrors || []).slice(0, 5)) {
                        console.log(`    ! ${we.err?.errmsg ?? we.errmsg}`);
                    }
                }
            }
        }
        console.log(`  ${state.name.padEnd(38)} ${String(wanted.size).padStart(4)} merged, +${toInsert.length} new`);
    }

    console.log(`\nCities: ${citiesMatched} already present, ${citiesCreated} created, ${citiesFailed} failed`);

    // --- Keep the public city pickers showing what they show today ------------
    if (!PRESERVE_POPULAR) {
        console.log('\nisPopular: left alone (--no-preserve-popular).');
    } else if (!preExistingCityIds.size) {
        console.log('\nisPopular: nothing predates this run, nothing to flag.');
    } else if (preExistingCityIds.size > FIRST_SEED_CITY_LIMIT) {
        console.log(`\nisPopular: skipped - ${preExistingCityIds.size} cities predate this run, ` +
            `so this is not a first seed (limit ${FIRST_SEED_CITY_LIMIT}).`);
    } else if (!citiesCreated) {
        console.log('\nisPopular: skipped - no cities were created, so no picker window shifted.');
    } else {
        const ids = [...preExistingCityIds];
        console.log(`\nisPopular: flagging the ${ids.length} pre-existing cities so ` +
            `GET /locations/cities (capped at 50) still returns them first:`);
        for (const c of preExistingCities) console.log(`    ${c.name}`);
        if (!DRY_RUN) {
            const r = await City.updateMany({ _id: { $in: ids } }, { $set: { isPopular: true } });
            console.log(`  ${r.modifiedCount} updated.`);
        }
    }

    // --- Rows the merged dataset has no match for ----------------------------
    const wantedKeysByStateId = new Map();
    for (const s of resolvedStates) {
        if (!s.doc) continue;
        wantedKeysByStateId.set(String(s.doc._id), new Set((cityIndex.get(s.name) ?? new Map()).keys()));
    }
    const unmatched = preExistingCities.filter(c => {
        const wantedKeys = wantedKeysByStateId.get(String(c.state_id));
        return wantedKeys ? !wantedKeys.has(key(c.name)) : false;
    });
    if (unmatched.length) {
        console.log(`\n${unmatched.length} pre-existing cities have no match in either dataset ` +
            `(kept as-is - review manually, some are typos of a seeded city):`);
        for (const c of unmatched) console.log(`    ${c.name}  (id ${c._id})`);
    }

    const totals = {
        countries: await Country.countDocuments(),
        states: await State.countDocuments(),
        cities: await City.countDocuments()
    };
    console.log(`\nDB now: ${totals.countries} countries, ${totals.states} states, ${totals.cities} cities` +
        `${DRY_RUN ? '  (unchanged - dry run)' : ''}`);

    await mongoose.disconnect();
})().catch(async (err) => {
    console.error('Seed failed:', err);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
});
