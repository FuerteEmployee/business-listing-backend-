/**
 * Shared helper to sanitise sentinel location values and resolve
 * "Add Manually..." location entries by finding-or-creating the
 * corresponding Country / State / City / Area.
 *
 * Used by both the public `companyController.createCompany` and
 * the admin `adminListingController.createListingAdmin` flows.
 *
 * Mutates `payload` in place.
 */

const Country = require('../models/Country');
const State = require('../models/State');
const City = require('../models/City');
const Area = require('../models/Area');
const slugify = require('slugify');

/**
 * ObjectId-typed fields that may arrive as sentinel strings from the frontend's
 * "Add Manually..." option or from stale/empty form state.
 */
const LOCATION_REF_FIELDS = ['country_id', 'state_id', 'city_id', 'area_id', 'category_id', 'subCategoryId'];
const NON_IDS = new Set(['manual', 'null', 'undefined', '']);

/**
 * 1. Sanitise — replace sentinel strings with null so Mongoose never casts
 *    e.g. "manual" into an ObjectId.
 * 2. Resolve — if a manual* field is present (e.g. manualCity) and the
 *    corresponding *_id is null, find-or-create the entity.
 *
 * @param {Object} payload  The request body (mutated in place).
 */
async function resolveManualLocation(payload) {
    // ---- Step 1: sanitise sentinel values ----
    LOCATION_REF_FIELDS.forEach(f => {
        if (typeof payload[f] === 'string' && NON_IDS.has(payload[f].trim())) {
            payload[f] = null;
        }
    });

    // Also sanitise manual* fields themselves so downstream code sees null
    // instead of the sentinel when the user selected "manual" but typed nothing.
    ['manualCountry', 'manualState', 'manualCity', 'manualArea'].forEach(f => {
        if (payload[f] === '' || payload[f] === 'manual') payload[f] = null;
    });

    // ---- Step 2: cascading find-or-create ----
    try {
        // 1. Country
        if (!payload.country_id && payload.manualCountry) {
            let country = await Country.findOne({
                $or: [
                    { name: new RegExp(`^${payload.manualCountry}$`, 'i') },
                    ...(payload.manualCountryCode
                        ? [{ code: payload.manualCountryCode.toUpperCase() }]
                        : [])
                ]
            });
            if (!country && payload.manualCountryCode) {
                country = await Country.create({
                    name: payload.manualCountry,
                    code: payload.manualCountryCode.toUpperCase(),
                    status: 'Active'
                });
            }
            if (country) payload.country_id = country._id;
        }

        // 2. State
        if (payload.country_id && !payload.state_id && payload.manualState) {
            let state = await State.findOne({
                country_id: payload.country_id,
                name: new RegExp(`^${payload.manualState}$`, 'i')
            });
            if (!state) {
                state = await State.create({
                    country_id: payload.country_id,
                    name: payload.manualState,
                    status: 'Active'
                });
            }
            if (state) payload.state_id = state._id;
        }

        // 3. City
        if (payload.state_id && !payload.city_id && payload.manualCity) {
            let city = await City.findOne({
                state_id: payload.state_id,
                name: new RegExp(`^${payload.manualCity}$`, 'i')
            });
            if (!city) {
                const citySlug = slugify(payload.manualCity, { lower: true, strict: true });
                city = await City.create({
                    state_id: payload.state_id,
                    name: payload.manualCity,
                    slug: citySlug,
                    status: 'Active'
                });
            }
            if (city) payload.city_id = city._id;
        }

        // 4. Area
        if (payload.city_id && !payload.area_id && payload.manualArea) {
            let area = await Area.findOne({
                city_id: payload.city_id,
                name: new RegExp(`^${payload.manualArea}$`, 'i')
            });
            if (!area) {
                const areaSlug = slugify(payload.manualArea, { lower: true, strict: true });
                area = await Area.create({
                    city_id: payload.city_id,
                    name: payload.manualArea,
                    slug: areaSlug,
                    status: 'Active'
                });
            }
            if (area) payload.area_id = area._id;
        }
    } catch (locErr) {
        console.error('Error handling cascading manual location:', locErr);
    }
}

module.exports = { resolveManualLocation, LOCATION_REF_FIELDS, NON_IDS };
