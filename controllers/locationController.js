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

// ==========================================
// PUBLIC APIs (Dropdowns & Search)
// ==========================================

exports.getCountries = async (req, res) => {
    try {
        const countries = await Country.find({ status: 'Active' }).sort({ name: 1 });
        res.status(200).json({ success: true, count: countries.length, data: countries });
    } catch (err) {
        res.status(500).json({ success: false, msg: 'Server Error' });
    }
};

exports.getStates = async (req, res) => {
    try {
        const { country_id } = req.query;
        if (!country_id) return res.status(400).json({ success: false, msg: 'country_id is required' });

        const states = await State.find({ country_id, status: 'Active' }).sort({ name: 1 });
        res.status(200).json({ success: true, count: states.length, data: states });
    } catch (err) {
        res.status(500).json({ success: false, msg: 'Server Error' });
    }
};

exports.getCities = async (req, res) => {
    try {
        const { state_id } = req.query;
        
        let cities;
        if (state_id) {
            // Get cities for specific state
            cities = await City.find({ state_id, status: 'Active' }).sort({ isPopular: -1, order: 1, name: 1 });
        } else {
            // Get all cities if no state_id provided (for homepage dropdown)
            cities = await City.find({ status: 'Active' }).sort({ isPopular: -1, order: 1, name: 1 }).limit(50);
        }
        
        res.status(200).json({ success: true, count: cities.length, data: cities });
    } catch (err) {
        console.error('Get Cities Error:', err);
        res.status(500).json({ success: false, msg: 'Server Error' });
    }
};

exports.getAreas = async (req, res) => {
    try {
        const { city_id } = req.query;
        if (!city_id) return res.status(400).json({ success: false, msg: 'city_id is required' });

        const areas = await Area.find({ city_id, status: 'Active' }).sort({ name: 1 });
        res.status(200).json({ success: true, count: areas.length, data: areas });
    } catch (err) {
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
        const country = await Country.findByIdAndDelete(req.params.id);
        if (!country) return res.status(404).json({ success: false, msg: 'Country not found' });
        // Cascade delete conceptually (in a real app, delete states, cities, etc.)
        await State.deleteMany({ country_id: req.params.id });
        res.status(200).json({ success: true, data: {} });
    } catch (err) { res.status(500).json({ success: false, msg: 'Server Error' }); }
};

// --- States ---
exports.adminGetStates = async (req, res) => {
    try {
        const states = await State.find().populate('country_id', 'name').sort({ name: 1 });
        res.status(200).json({ success: true, data: states });
    } catch (err) { res.status(500).json({ success: false, msg: 'Server Error' }); }
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
        const state = await State.findByIdAndDelete(req.params.id);
        if (!state) return res.status(404).json({ success: false, msg: 'State not found' });
        await City.deleteMany({ state_id: req.params.id });
        res.status(200).json({ success: true, data: {} });
    } catch (err) { res.status(500).json({ success: false, msg: 'Server Error' }); }
};

// --- Cities ---
exports.adminGetCities = async (req, res) => {
    try {
        const cities = await City.find().populate({ path: 'state_id', select: 'name country_id', populate: { path: 'country_id', select: 'name' } }).sort({ name: 1 });
        res.status(200).json({ success: true, data: cities });
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
        const areas = await Area.find().populate({ path: 'city_id', select: 'name state_id', populate: { path: 'state_id', select: 'name' } }).sort({ name: 1 });
        res.status(200).json({ success: true, data: areas });
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
