const mongoose = require('mongoose');
const Country = require('../models/Country');
const State = require('../models/State');
const City = require('../models/City');
const Area = require('../models/Area');

// Helper to create a slug
const generateSlug = (name) => {
    return name.toString().toLowerCase()
        .replace(/\s+/g, '-')           // Replace spaces with -
        .replace(/[^\w\-]+/g, '')       // Remove all non-word chars
        .replace(/\-\-+/g, '-')         // Replace multiple - with single -
        .replace(/^-+/, '')             // Trim - from start of text
        .replace(/-+$/, '');            // Trim - from end of text
};

// Location deletes must walk the whole Country > State > City > Area chain by hand:
// Mongoose has no cascade, so deleting only the immediate children leaves the deeper
// levels pointing at ids that no longer exist, and orphaned areas stay assignable to listings.
const cascadeDeleteCities = async (cityIds) => {
    if (!cityIds.length) return;
    await Area.deleteMany({ city_id: { $in: cityIds } });
    await City.deleteMany({ _id: { $in: cityIds } });
};

const cascadeDeleteStates = async (stateIds) => {
    if (!stateIds.length) return;
    const cities = await City.find({ state_id: { $in: stateIds } }).select('_id');
    await cascadeDeleteCities(cities.map(c => c._id));
    await State.deleteMany({ _id: { $in: stateIds } });
};

// ==========================================
// LIST HELPERS (filtering + pagination)
// ==========================================
// Cities number ~7.9k, so no list endpoint may return the whole collection: the old
// unbounded `City.find().populate(...)` behind the admin table shipped every document
// with two levels of populate on every page load. Everything below is filtered and
// paginated server-side, and the responses keep the original
// `{ success, count, data }` shape so existing callers are unaffected.

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

// Search terms land inside a RegExp, so metacharacters have to be neutralised -
// otherwise a stray "(" is a 500 and ".*" is a deliberate full scan.
const escapeRegex = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const searchRegex = (search) => new RegExp(escapeRegex(search), 'i');

const parseListParams = (req, { defaultLimit = DEFAULT_LIMIT } = {}) => {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const parsedLimit = parseInt(req.query.limit, 10);
    const limit = Math.min(
        MAX_LIMIT,
        Math.max(1, Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : defaultLimit)
    );
    const search = String(req.query.search ?? req.query.q ?? '').trim();
    return { page, limit, skip: (page - 1) * limit, search };
};

// `?ids=a,b,c` lets a paginated dropdown resolve the label of an already-selected
// row that is not on the page it is currently showing (e.g. editing a listing whose
// city sits 900 entries deep). Invalid ids are dropped rather than throwing a cast error.
const parseIds = (req) => {
    const raw = req.query.ids;
    if (!raw) return null;
    const ids = String(raw).split(',').map(s => s.trim())
        .filter(id => mongoose.Types.ObjectId.isValid(id));
    return ids.length ? ids : null;
};

const listResponse = ({ data, total, page, limit }) => ({
    success: true,
    count: data.length,
    total,
    page,
    limit,
    pages: Math.max(1, Math.ceil(total / limit)),
    hasMore: page * limit < total,
    data
});

// ==========================================
// PUBLIC APIs (Dropdowns & Search)
// ==========================================

exports.getCountries = async (req, res) => {
    try {
        const { page, limit, skip, search } = parseListParams(req);
        const filter = { status: 'Active' };
        if (search) filter.name = searchRegex(search);

        const [countries, total] = await Promise.all([
            Country.find(filter).sort({ name: 1 }).skip(skip).limit(limit).lean(),
            Country.countDocuments(filter)
        ]);
        res.status(200).json(listResponse({ data: countries, total, page, limit }));
    } catch (err) {
        console.error('getCountries Error:', err);
        res.status(500).json({ success: false, msg: 'Server Error' });
    }
};

exports.getStates = async (req, res) => {
    try {
        const { page, limit, skip, search } = parseListParams(req);
        const ids = parseIds(req);
        const { country_id } = req.query;

        // `ids` resolves specific rows for a dropdown label, so it stands alone.
        if (!ids && !country_id) {
            return res.status(400).json({ success: false, msg: 'country_id is required' });
        }

        const filter = { status: 'Active' };
        if (ids) filter._id = { $in: ids };
        if (country_id) filter.country_id = country_id;
        if (search) filter.name = searchRegex(search);

        const [states, total] = await Promise.all([
            State.find(filter).sort({ name: 1 }).skip(skip).limit(limit).lean(),
            State.countDocuments(filter)
        ]);
        res.status(200).json(listResponse({ data: states, total, page, limit }));
    } catch (err) {
        console.error('getStates Error:', err);
        res.status(500).json({ success: false, msg: 'Server Error' });
    }
};

exports.getCities = async (req, res) => {
    try {
        const { page, limit, skip, search } = parseListParams(req);
        const ids = parseIds(req);
        const { state_id } = req.query;

        const filter = { status: 'Active' };
        if (ids) filter._id = { $in: ids };
        if (state_id) filter.state_id = state_id;
        if (search) filter.name = searchRegex(search);

        // isPopular first keeps the public pickers (which pass no state_id and take the
        // default limit) showing the cities an admin has promoted, exactly as before.
        const [cities, total] = await Promise.all([
            City.find(filter).sort({ isPopular: -1, order: 1, name: 1 }).skip(skip).limit(limit).lean(),
            City.countDocuments(filter)
        ]);
        res.status(200).json(listResponse({ data: cities, total, page, limit }));
    } catch (err) {
        console.error('getCities Error:', err);
        res.status(500).json({ success: false, msg: 'Server Error' });
    }
};

exports.getAreas = async (req, res) => {
    try {
        const { page, limit, skip, search } = parseListParams(req);
        const ids = parseIds(req);
        const { city_id } = req.query;

        if (!ids && !city_id) {
            return res.status(400).json({ success: false, msg: 'city_id is required' });
        }

        const filter = { status: 'Active' };
        if (ids) filter._id = { $in: ids };
        if (city_id) filter.city_id = city_id;
        if (search) filter.name = searchRegex(search);

        const [areas, total] = await Promise.all([
            Area.find(filter).sort({ name: 1 }).skip(skip).limit(limit).lean(),
            Area.countDocuments(filter)
        ]);
        res.status(200).json(listResponse({ data: areas, total, page, limit }));
    } catch (err) {
        console.error('getAreas Error:', err);
        res.status(500).json({ success: false, msg: 'Server Error' });
    }
};


// ==========================================
// ADMIN APIs (CRUD)
// ==========================================

// --- Countries ---
exports.adminGetCountries = async (req, res) => {
    try {
        const countries = await Country.find().sort({ name: 1 });
        res.status(200).json({ success: true, data: countries });
    } catch (err) { res.status(500).json({ success: false, msg: 'Server Error' }); }
};

exports.createCountry = async (req, res) => {
    try {
        const { name, code, status } = req.body;
        const country = await Country.create({ name, code, status });
        res.status(201).json({ success: true, data: country });
    } catch (err) {
        if (err.code === 11000) return res.status(400).json({ success: false, msg: 'Country name or code already exists' });
        res.status(500).json({ success: false, msg: 'Server Error' });
    }
};

exports.updateCountry = async (req, res) => {
    try {
        const country = await Country.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!country) return res.status(404).json({ success: false, msg: 'Country not found' });
        res.status(200).json({ success: true, data: country });
    } catch (err) { res.status(500).json({ success: false, msg: 'Server Error' }); }
};

exports.deleteCountry = async (req, res) => {
    try {
        const country = await Country.findById(req.params.id);
        if (!country) return res.status(404).json({ success: false, msg: 'Country not found' });

        const states = await State.find({ country_id: req.params.id }).select('_id');
        await cascadeDeleteStates(states.map(s => s._id));
        await Country.findByIdAndDelete(req.params.id);

        res.status(200).json({ success: true, data: {} });
    } catch (err) { res.status(500).json({ success: false, msg: 'Server Error' }); }
};

// --- States ---
exports.adminGetStates = async (req, res) => {
    try {
        const { page, limit, skip, search } = parseListParams(req);
        const { country_id, status } = req.query;

        const filter = {};
        if (country_id) filter.country_id = country_id;
        if (status) filter.status = status;
        if (search) filter.name = searchRegex(search);

        const [states, total] = await Promise.all([
            State.find(filter).populate('country_id', 'name').sort({ name: 1 })
                .skip(skip).limit(limit).lean(),
            State.countDocuments(filter)
        ]);
        res.status(200).json(listResponse({ data: states, total, page, limit }));
    } catch (err) {
        console.error('adminGetStates Error:', err);
        res.status(500).json({ success: false, msg: 'Server Error' });
    }
};

exports.createState = async (req, res) => {
    try {
        const { country_id, name, status } = req.body;
        const state = await State.create({ country_id, name, status });
        res.status(201).json({ success: true, data: state });
    } catch (err) {
        if (err.code === 11000) return res.status(400).json({ success: false, msg: 'State already exists in this country' });
        res.status(500).json({ success: false, msg: 'Server Error' });
    }
};

exports.updateState = async (req, res) => {
    try {
        const state = await State.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!state) return res.status(404).json({ success: false, msg: 'State not found' });
        res.status(200).json({ success: true, data: state });
    } catch (err) { res.status(500).json({ success: false, msg: 'Server Error' }); }
};

exports.deleteState = async (req, res) => {
    try {
        const state = await State.findById(req.params.id);
        if (!state) return res.status(404).json({ success: false, msg: 'State not found' });

        await cascadeDeleteStates([state._id]);

        res.status(200).json({ success: true, data: {} });
    } catch (err) { res.status(500).json({ success: false, msg: 'Server Error' }); }
};

// --- Cities ---
exports.adminGetCities = async (req, res) => {
    try {
        const { page, limit, skip, search } = parseListParams(req);
        const ids = parseIds(req);
        const { state_id, status, isPopular } = req.query;

        const filter = {};
        if (ids) filter._id = { $in: ids };
        if (state_id) filter.state_id = state_id;
        if (status) filter.status = status;
        if (isPopular === 'true' || isPopular === 'false') filter.isPopular = isPopular === 'true';

        if (search) {
            const rx = searchRegex(search);
            // The admin table's search box used to match city, state OR country name
            // client-side. Resolving state/country names to ids first preserves that
            // without a $lookup, and stays cheap because there are only ~36 states.
            const matchedStates = await State.find({ name: rx }).select('_id').lean();
            const matchedCountries = await Country.find({ name: rx }).select('_id').lean();
            const statesOfCountries = matchedCountries.length
                ? await State.find({ country_id: { $in: matchedCountries.map(c => c._id) } }).select('_id').lean()
                : [];

            const stateIds = [...new Set(
                [...matchedStates, ...statesOfCountries].map(s => String(s._id))
            )];

            filter.$or = [{ name: rx }, { slug: rx }];
            if (stateIds.length) filter.$or.push({ state_id: { $in: stateIds } });
        }

        const [cities, total] = await Promise.all([
            City.find(filter)
                .populate({ path: 'state_id', select: 'name country_id', populate: { path: 'country_id', select: 'name' } })
                .sort({ isPopular: -1, order: 1, name: 1 })
                .skip(skip).limit(limit).lean(),
            City.countDocuments(filter)
        ]);
        res.status(200).json(listResponse({ data: cities, total, page, limit }));
    } catch (err) {
        console.error('adminGetCities Error:', err);
        res.status(500).json({ success: false, msg: 'Server Error' });
    }
};

exports.createCity = async (req, res) => {
    try {
        const { state_id, name, status, slug, boundary, isPopular, order, meta } = req.body;
        const citySlug = slug ? generateSlug(slug) : generateSlug(name);

        const city = await City.create({ 
            state_id, 
            name, 
            status, 
            slug: citySlug,
            boundary,
            isPopular,
            order,
            meta
        });
        res.status(201).json({ success: true, data: city });
    } catch (err) {
        console.error('createCity Error:', err);
        if (err.code === 11000) return res.status(400).json({ success: false, msg: 'City name or slug already exists' });
        res.status(500).json({ success: false, msg: 'Server Error' });
    }
};

exports.updateCity = async (req, res) => {
    try {
        if (req.body.name && !req.body.slug) {
            req.body.slug = generateSlug(req.body.name);
        } else if (req.body.slug) {
            req.body.slug = generateSlug(req.body.slug);
        }

        const city = await City.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!city) return res.status(404).json({ success: false, msg: 'City not found' });
        res.status(200).json({ success: true, data: city });
    } catch (err) {
        console.error('updateCity Error:', err);
        res.status(500).json({ success: false, msg: 'Server Error' });
    }
};

exports.deleteCity = async (req, res) => {
    try {
        const city = await City.findByIdAndDelete(req.params.id);
        if (!city) return res.status(404).json({ success: false, msg: 'City not found' });
        await Area.deleteMany({ city_id: req.params.id });
        res.status(200).json({ success: true, data: {} });
    } catch (err) {
        console.error('deleteCity Error:', err);
        res.status(500).json({ success: false, msg: 'Server Error' });
    }
};

// --- Areas ---
exports.adminGetAreas = async (req, res) => {
    try {
        const { page, limit, skip, search } = parseListParams(req);
        const ids = parseIds(req);
        const { city_id, state_id, status } = req.query;

        const filter = {};
        if (ids) filter._id = { $in: ids };
        if (city_id) filter.city_id = city_id;
        if (status) filter.status = status;

        // Areas are addressed by city, so a state filter has to go through cities.
        // Bounded deliberately: one state tops out at ~1,050 cities, and an unbounded
        // $in would be worse than the query it replaces.
        if (state_id && !city_id) {
            const cityIds = await City.find({ state_id }).select('_id').limit(2000).lean();
            filter.city_id = { $in: cityIds.map(c => c._id) };
        }

        if (search) {
            const rx = searchRegex(search);
            filter.$or = [{ name: rx }, { slug: rx }, { pincode: rx }];
        }

        const [areas, total] = await Promise.all([
            Area.find(filter)
                .populate({ path: 'city_id', select: 'name state_id', populate: { path: 'state_id', select: 'name' } })
                .sort({ name: 1 })
                .skip(skip).limit(limit).lean(),
            Area.countDocuments(filter)
        ]);
        res.status(200).json(listResponse({ data: areas, total, page, limit }));
    } catch (err) {
        console.error('adminGetAreas Error:', err);
        res.status(500).json({ success: false, msg: 'Server Error' });
    }
};

exports.createArea = async (req, res) => {
    try {
        const { city_id, name, pincode, status, slug, meta } = req.body;
        if (!city_id) return res.status(400).json({ success: false, msg: 'city_id is required' });
        
        const areaSlug = slug ? generateSlug(slug) : generateSlug(name);

        const area = await Area.create({ city_id, name, pincode, status, slug: areaSlug, meta });
        res.status(201).json({ success: true, data: area });
    } catch (err) {
        console.error('createArea Error:', err);
        if (err.code === 11000) return res.status(400).json({ success: false, msg: 'Area name or slug already exists' });
        res.status(500).json({ success: false, msg: 'Server Error' });
    }
};

exports.updateArea = async (req, res) => {
    try {
        if (req.body.name && !req.body.slug) {
            req.body.slug = generateSlug(req.body.name);
        } else if (req.body.slug) {
            req.body.slug = generateSlug(req.body.slug);
        }

        const area = await Area.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!area) return res.status(404).json({ success: false, msg: 'Area not found' });
        res.status(200).json({ success: true, data: area });
    } catch (err) {
        console.error('updateArea Error:', err);
        res.status(500).json({ success: false, msg: 'Server Error' });
    }
};

exports.deleteArea = async (req, res) => {
    try {
        const area = await Area.findByIdAndDelete(req.params.id);
        if (!area) return res.status(404).json({ success: false, msg: 'Area not found' });
        res.status(200).json({ success: true, data: {} });
    } catch (err) {
        console.error('deleteArea Error:', err);
        res.status(500).json({ success: false, msg: 'Server Error' });
    }
};
