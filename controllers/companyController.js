const mongoose = require('mongoose');
const Company = require('../models/Company');
const User = require('../models/User');
const Category = require('../models/Category');
const Country = require('../models/Country');
const State = require('../models/State');
const City = require('../models/City');
const Area = require('../models/Area');
const slugify = require('slugify');
const { isBrandScoped, isAdminUser } = require('../middleware/authMiddleware');

// Moderation, ranking and trust fields only an admin may set. A brand owner (or an anonymous
// free-listing sign-up) sending them could otherwise self-approve, self-feature or fake a rating.
const ADMIN_ONLY_LISTING_FIELDS = [
    'status', 'approvalStatus', 'flags', 'isFlagged', 'suspensionDetails', 'possibleDuplicates',
    'mergedWith', 'claimVerification', 'plan', 'businessBadgeVerified', 'badgeVerifiedBy',
    'badgeVerifiedAt', 'verified', 'verificationStatus', 'isClaimPending', 'claimed', 'isFeatured',
    'rating', 'reviewCount', 'ratingDistribution', 'responseTime', 'manualRank', 'changeHistory'
];
const stripAdminOnlyFields = (body) => ADMIN_ONLY_LISTING_FIELDS.forEach(f => delete body[f]);
const { resolveManualLocation } = require('../utils/resolveManualLocation');

// Escape special regex characters to prevent regex injection.
const escapeRegex = (str) => String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Helper to create a basic fuzzy regex (e.g. "pilo" -> "p.*i.*l.*o")
const createFuzzyRegex = (str) => {
    if (!str) return '';
    return escapeRegex(str).split('').join('.*');
};

// --- Pagination guards -----------------------------------------------------
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;   // the list response carries phone/email, so cap it
const MAX_PAGE = 5000;

// Coerce to a safe integer inside [min, max]; anything unparseable becomes the
// fallback. Never let a user-supplied value reach $skip / $limit unchecked.
const clampInt = (value, fallback, min, max) => {
    const n = Number.parseInt(value, 10);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(Math.max(n, min), max);
};

// --- Autocomplete relevance ------------------------------------------------
const AUTOCOMPLETE_LIMIT = 10;        // rows returned to the client
const AUTOCOMPLETE_FETCH_LIMIT = 10;  // rows pulled per collection per tier
const AUTOCOMPLETE_MAX_FUZZY = 3;     // cap on subsequence-only matches

// Lower rank = better match. Tiers: exact, prefix, whole word, substring, fuzzy.
const matchRank = (name, term) => {
    const haystack = String(name || '').toLowerCase();
    const needle = String(term || '').toLowerCase();
    if (!needle) return 4;

    if (haystack === needle) return 0;
    if (haystack.startsWith(needle)) return 1;
    // Whole-word hit, e.g. "cnc" in "Precision CNC Works".
    if (new RegExp(`\\b${escapeRegex(needle)}\\b`, 'i').test(haystack)) return 2;
    if (haystack.includes(needle)) return 3;
    return 4; // matched only as a fuzzy subsequence
};

// Which search parameter a result matched, with the value that matched, so the results
// page can say why it is listed. Mirrors the searchRank tiers in getAllCompanies.
// Returns { type: 'name' | 'category' | 'product' | 'keyword', value } or null (fuzzy name hit).
const describeMatch = (company, products, services, search) => {
    const re = new RegExp(search.literal, 'i');
    const isActive = (item) => item.status === 'Active';

    switch (company.searchRank) {
        case 0:
            return { type: 'name', value: company.name };
        case 1:
            return { type: 'category', value: company.category_id?.name || company.category || '' };
        case 2: {
            const item = [...products, ...services].find(i => isActive(i) && re.test(i.name || ''));
            return item ? { type: 'product', value: item.name } : null;
        }
        default: {
            const tag = (company.tags || []).find(t => re.test(t || ''));
            if (tag) return { type: 'keyword', value: tag };
            for (const p of products) {
                const kw = isActive(p) && (p.keywords || []).find(k => re.test(k || ''));
                if (kw) return { type: 'keyword', value: kw };
            }
            return null;
        }
    }
};

// --- Search query parsing ---------------------------------------------------
// Words that carry no meaning in a directory search ("plumber IN andheri", "BEST cnc dealers")
const SEARCH_STOP_WORDS = new Set(['in', 'near', 'at', 'the', 'for', 'and', 'of', 'a', 'an', 'to', 'with', 'me', 'best', 'top', 'shop', 'shops', 'store', 'stores', '&', '-']);

// Plural ending stripped to a stem that, matched as a substring, finds both forms:
// "machines" -> "machine", "boxes" -> "box", "batteries" -> "batter" (battery/batteries).
const stemPlural = (word) => {
    if (word.length <= 3) return word;
    if (/ies$/.test(word) && word.length > 5) return word.slice(0, -3);
    if (/(sses|xes|zes|ches|shes)$/.test(word)) return word.slice(0, -2);
    if (/s$/.test(word) && !/(ss|us|is)$/.test(word)) return word.slice(0, -1);
    return word;
};

/**
 * Split a raw query into what to match. A city typed into the query (one or two words,
 * e.g. "pune" or "navi mumbai") is lifted out as a city filter.
 * Returns { phrase, words, city } - phrase/words already singularised and stop-word free.
 */
const parseSearchQuery = async (raw) => {
    let tokens = String(raw).toLowerCase().replace(/[^\p{L}\p{N}&\-\s.]/gu, ' ').split(/\s+/).filter(Boolean);

    let city = null;
    if (tokens.length > 1) {
        const candidates = [];
        for (let i = 0; i < tokens.length; i++) {
            candidates.push({ start: i, len: 1, text: tokens[i] });
            if (i + 1 < tokens.length) candidates.push({ start: i, len: 2, text: `${tokens[i]} ${tokens[i + 1]}` });
        }
        const names = candidates.filter(c => c.text.length >= 3 && !SEARCH_STOP_WORDS.has(c.text));
        if (names.length) {
            const cities = await City.find({
                name: { $in: names.map(c => new RegExp(`^${escapeRegex(c.text)}$`, 'i')) }
            }).select('_id name').lean();
            if (cities.length) {
                // Prefer the longest match ("navi mumbai" over "mumbai"); keep at least one search word
                const hit = names
                    .filter(c => cities.some(ct => ct.name.toLowerCase() === c.text))
                    .sort((a, b) => b.len - a.len)[0];
                const remaining = tokens.filter((_, i) => i < hit.start || i >= hit.start + hit.len);
                if (remaining.some(t => !SEARCH_STOP_WORDS.has(t))) {
                    city = cities.find(ct => ct.name.toLowerCase() === hit.text);
                    tokens = remaining;
                }
            }
        }
    }

    // Phrase: the text as typed, minus filler at either end ("plumber in" -> "plumber"; a name
    // like "Bed and Breakfast" keeps its inner "and"), with only the last word de-pluralised.
    let start = 0;
    let end = tokens.length;
    while (start < end && SEARCH_STOP_WORDS.has(tokens[start])) start++;
    while (end > start && SEARCH_STOP_WORDS.has(tokens[end - 1])) end--;
    const core = start < end ? tokens.slice(start, end) : tokens;
    const phrase = [...core.slice(0, -1), stemPlural(core[core.length - 1] || '')].join(' ').trim();

    // Words: each meaningful word on its own, de-pluralised
    const meaningful = tokens.filter(t => !SEARCH_STOP_WORDS.has(t));
    const words = [...new Set((meaningful.length ? meaningful : tokens).map(stemPlural))].filter(w => w.length >= 2);
    return { phrase, words, city };
};

// @desc    Get all companies
// @route   GET /api/companies
const getAllCompanies = async (req, res) => {
    try {
        const { 
            q, category, categoryId, city, area, isFeatured, featured,
            page = 1, limit = 20, sort = 'rank', 
            rating, priceRange, openNow, lat, lng, owned
        } = req.query;
        
        // Clamp before these reach the aggregation pipeline. Unvalidated values
        // used to be passed straight through, so ?limit=-1 / ?page=-1 / ?limit=abc
        // produced a 500 that echoed the raw Mongo driver error, and
        // ?limit=100000 dumped the whole contact database in one request.
        const parsedLimit = clampInt(limit, DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);
        const parsedPage = clampInt(page, 1, 1, MAX_PAGE);
        const skip = (parsedPage - 1) * parsedLimit;

        let matchQuery = {};
        
        // 0. Enforce Approved/Active status for public listings
        const isInternal = req.user && (req.user.role === 'Admin' || req.user.role === 'Super Admin' || req.user.role === 'Developer');
        const isRequestingOwn = owned === 'true' && req.user;

        if (!isInternal && !isRequestingOwn) {
            matchQuery.status = { $in: ['Approved', 'Active'] };
        }

        if (isRequestingOwn) {
            matchQuery.owner = new mongoose.Types.ObjectId(req.user._id);
        }

        const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

        // 1. Basic Filters
        if (city && isValidObjectId(city)) matchQuery.city_id = new mongoose.Types.ObjectId(city);
        if (area && isValidObjectId(area)) matchQuery.area_id = new mongoose.Types.ObjectId(area);
        // Category filter by id or by slug (autocomplete links use ?category=<slug>), including
        // its sub-categories so a parent category page is not empty. The slug used to be ignored.
        let categoryDoc = null;
        if (categoryId && isValidObjectId(categoryId)) categoryDoc = await Category.findById(categoryId).select('_id').lean();
        else if (category) categoryDoc = await Category.findOne({ slug: String(category) }).select('_id').lean();
        if (categoryDoc) {
            const childIds = await Category.find({ parent: categoryDoc._id }).distinct('_id');
            matchQuery.category_id = { $in: [categoryDoc._id, ...childIds] };
        } else if (categoryId || category) {
            // Unknown category: return nothing rather than every listing
            matchQuery.category_id = { $in: [] };
        }
        if (isFeatured !== undefined || featured !== undefined) {
            matchQuery.isFeatured = (isFeatured === 'true' || featured === 'true');
        }
        if (priceRange) matchQuery.priceRange = priceRange;
        if (rating) matchQuery.rating = { $gte: parseFloat(rating) };

        // Open Now filter
        if (openNow === 'true') {
            const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
            const now = new Date();
            const currentDay = days[now.getDay()];
            const currentHH = String(now.getHours()).padStart(2, '0');
            const currentMM = String(now.getMinutes()).padStart(2, '0');
            const currentTimeString = `${currentHH}:${currentMM}`;

            const dayOpenKey = `businessHours.${currentDay}.open`;
            const dayCloseKey = `businessHours.${currentDay}.close`;
            const dayClosedKey = `businessHours.${currentDay}.closed`;

            matchQuery[dayClosedKey] = { $ne: true };
            matchQuery[dayOpenKey] = { $lte: currentTimeString };
            matchQuery[dayCloseKey] = { $gte: currentTimeString };
        }

        // 2. Search. A listing matches a term on four parameters - business name, category,
        //    product/service name, keyword (business tags + product keywords) - by literal,
        //    case-insensitive substring. See parseSearchQuery for how the text is read.
        const buildSearch = async (term) => {
            const literal = escapeRegex(term);
            const literalRegex = { $regex: literal, $options: 'i' };
            const Product = require('../models/Product');
            const Service = require('../models/Service');

            const [productNameIds, serviceNameIds, productKeywordIds, matchedCategories] = await Promise.all([
                Product.distinct('listingId', { status: 'Active', name: literalRegex }),
                Service.distinct('listingId', { status: 'Active', name: literalRegex }),
                Product.distinct('listingId', { status: 'Active', keywords: literalRegex }),
                Category.find({ name: literalRegex }).select('_id').lean()
            ]);

            const s = {
                term,
                literal,
                categoryIds: matchedCategories.map(c => c._id),
                // Services count as catalogue items alongside products
                productIds: [...productNameIds, ...serviceNameIds].filter(Boolean),
                keywordIds: productKeywordIds.filter(Boolean)
            };
            s.or = [
                { name: literalRegex },
                { category: literalRegex },
                { category_id: { $in: s.categoryIds } },
                { _id: { $in: s.productIds } },
                { tags: literalRegex },
                { _id: { $in: s.keywordIds } }
            ];
            return s;
        };

        // Read the query like a directory search box: a city named in it ("plumber in
        // ahmedabad") becomes the city filter, filler words are dropped and plurals are
        // reduced ("cnc machines" also finds "CNC Machine").
        const parsed = q ? await parseSearchQuery(String(q)) : null;
        if (parsed?.city) matchQuery.city_id = parsed.city._id;

        // Attempts, most precise first; the search widens only while an attempt finds nothing:
        //   1. the whole phrase
        //   2. every word matching one of the four parameters, in any order
        //   3. the phrase with the last 1-2 letters dropped, for a trailing typo ("Acmee")
        const attempts = [];
        if (parsed && parsed.phrase) {
            attempts.push({ mode: 'phrase', terms: [parsed.phrase] });
            if (parsed.words.length > 1 || (parsed.words.length && parsed.words.join(' ') !== parsed.phrase)) {
                attempts.push({ mode: 'words', terms: parsed.words });
            }
            for (let cut = 1; cut <= 2 && parsed.phrase.length - cut >= 3; cut++) {
                attempts.push({ mode: 'typo', terms: [parsed.phrase.slice(0, -cut).trim()] });
            }
        }

        // Rank each hit by the strongest parameter it matched:
        // 0 business name, 1 category, 2 product name, 3 keyword.
        const searchRankStage = (s) => ({
            $addFields: {
                searchRank: {
                    $switch: {
                        branches: [
                            { case: { $regexMatch: { input: { $ifNull: ['$name', ''] }, regex: s.literal, options: 'i' } }, then: 0 },
                            {
                                case: {
                                    $or: [
                                        { $in: ['$category_id', s.categoryIds] },
                                        { $regexMatch: { input: { $ifNull: ['$category', ''] }, regex: s.literal, options: 'i' } }
                                    ]
                                },
                                then: 1
                            },
                            { case: { $in: ['$_id', s.productIds] }, then: 2 }
                        ],
                        default: 3
                    }
                }
            }
        });

        const sortStage = (s) => {
            if (sort === 'latest') return { $sort: { createdAt: -1 } };
            if (sort === 'rating') return { $sort: { rating: -1 } };
            if (sort === 'reviews') return { $sort: { reviewCount: -1 } };
            if (sort === 'price_asc') return { $sort: { priceRange: 1, rating: -1 } };
            if (sort === 'price_desc') return { $sort: { priceRange: -1, rating: -1 } };
            // Default ranking: best search match first (when searching), then Premium,
            // then manualRank, then rating.
            return { $sort: { ...(s ? { searchRank: 1 } : {}), isFeatured: -1, manualRank: -1, rating: -1 } };
        };

        const buildPipeline = (match, s) => {
            const stages = [];
            // 3. Geospatial Sort (must be first stage)
            if (sort === 'distance' && lat && lng) {
                stages.push({
                    $geoNear: {
                        near: { type: "Point", coordinates: [parseFloat(lng), parseFloat(lat)] },
                        distanceField: "distance",
                        spherical: true,
                        query: match
                    }
                });
                if (s) stages.push(searchRankStage(s));
            } else {
                stages.push({ $match: match });
                if (s) stages.push(searchRankStage(s));
                stages.push(sortStage(s));
            }
            return stages;
        };

        const countFor = async (stages) => {
            const result = await Company.aggregate([...stages, { $count: "total" }]);
            return result.length > 0 ? result[0].total : 0;
        };

        // 4. Pagination & Count. Each attempt runs in the selected city, then - unless the
        //    city was typed into the query - across all cities. The first attempt is kept
        //    even when empty so a miss still returns a valid page.
        const withoutCity = (match) => { const m = { ...match }; delete m.city_id; return m; };
        let pipeline = null;
        let total = 0;
        let search = null;
        let used = null;
        const tryMatch = async (match, s, info) => {
            const stages = buildPipeline(match, s);
            const count = await countFor(stages);
            if (count > 0 || pipeline === null) {
                pipeline = stages;
                total = count;
                search = s;
                used = info;
            }
            return count;
        };
        const canDropCity = (match) => match.city_id && !parsed?.city;

        if (attempts.length === 0) {
            if (await tryMatch(matchQuery, null, { cityRelaxed: false }) === 0 && canDropCity(matchQuery)) {
                await tryMatch(withoutCity(matchQuery), null, { cityRelaxed: true });
            }
        } else {
            for (const attempt of attempts) {
                const searches = await Promise.all(attempt.terms.map(buildSearch));
                // The longest word drives ranking and the "matched on" label in words mode
                const primary = searches.reduce((a, b) => (b.term.length > a.term.length ? b : a));
                const match = searches.length === 1
                    ? { ...matchQuery, $or: primary.or }
                    : { ...matchQuery, $and: searches.map(s => ({ $or: s.or })) };
                if (await tryMatch(match, primary, { attempt, cityRelaxed: false }) > 0) break;
                if (canDropCity(match) && await tryMatch(withoutCity(match), primary, { attempt, cityRelaxed: true }) > 0) break;
            }
        }

        // Tell the client how the query was interpreted, so the page can say e.g.
        // "Showing results for 'acme'" or "No results in Pune - showing all cities".
        const searchMeta = {
            query: q ? String(q).trim() : '',
            interpretedAs: used?.attempt ? used.attempt.terms.join(' ') : (parsed?.phrase || ''),
            mode: used?.attempt?.mode || null,
            corrected: used?.attempt?.mode === 'typo',
            detectedCity: parsed?.city ? { _id: parsed.city._id, name: parsed.city.name } : null,
            cityRelaxed: !!used?.cityRelaxed
        };

        // Search analytics: record what people look for (first page only, never blocks the reply)
        if (searchMeta.query && parsedPage === 1) {
            const AnalyticsEvent = require('../models/AnalyticsEvent');
            AnalyticsEvent.create({
                eventType: 'search',
                sessionId: String(req.headers['x-session-id'] || req.ip || 'anonymous'),
                userId: req.user?._id,
                searchQuery: searchMeta.query.toLowerCase().slice(0, 100),
                locationId: matchQuery.city_id || undefined,
                resultCount: total
            }).catch(e => console.error('Search log error:', e.message));
        }

        pipeline.push({ $skip: skip });
        pipeline.push({ $limit: parsedLimit });

        // 5. Lookup relations
        pipeline.push(
            { $lookup: { from: 'cities', localField: 'city_id', foreignField: '_id', as: 'city_id' } },
            { $unwind: { path: '$city_id', preserveNullAndEmptyArrays: true } },
            { $lookup: { from: 'areas', localField: 'area_id', foreignField: '_id', as: 'area_id' } },
            { $unwind: { path: '$area_id', preserveNullAndEmptyArrays: true } },
            { $lookup: { from: 'categories', localField: 'category_id', foreignField: '_id', as: 'category_id' } },
            { $unwind: { path: '$category_id', preserveNullAndEmptyArrays: true } }
        );

        let companies = await Company.aggregate(pipeline);

        // 6. Associate Items (Products/Services) 
        // We do this after main pagination to keep it fast
        const Product = require('../models/Product');
        const Service = require('../models/Service');
        const companyIds = companies.map(c => c._id);

        const [allProducts, allServices] = await Promise.all([
            // Drafts/archived items must not leak into public results
            Product.find({ listingId: { $in: companyIds }, status: 'Active' }).lean(),
            Service.find({ listingId: { $in: companyIds }, status: 'Active' }).lean()
        ]);

        const productsByCompany = {};
        allProducts.forEach(p => {
            const cid = p.listingId.toString();
            if(!productsByCompany[cid]) productsByCompany[cid] = [];
            productsByCompany[cid].push(p);
        });

        const servicesByCompany = {};
        allServices.forEach(s => {
            const cid = s.listingId.toString();
            if(!servicesByCompany[cid]) servicesByCompany[cid] = [];
            servicesByCompany[cid].push(s);
        });

        companies = companies.map(company => {
            const rawImages = (company.images || []).filter(Boolean);
            const approvedImages = rawImages.filter(img =>
                typeof img === 'object' && img !== null ? (img.status === 'Approved' || !img.status) : true
            );
            const photoUrls = approvedImages.map(img => (typeof img === 'object' && img !== null ? img.url : img)).filter(Boolean);
            const coverObj = approvedImages.find(img => typeof img === 'object' && img !== null && img.isCover) || approvedImages[0];
            const fallbackImage = company.category_id?.image || null;
            const coverUrl = company.image || (coverObj ? (typeof coverObj === 'object' && coverObj !== null ? coverObj.url : coverObj) : null) || fallbackImage;

            const products = productsByCompany[company._id.toString()] || [];
            const services = servicesByCompany[company._id.toString()] || [];

            return {
                ...company,
                image: coverUrl,
                photos: photoUrls,
                products,
                services,
                ...(search && { matchedOn: describeMatch(company, products, services, search) })
            };
        });

        res.json({
            data: companies,
            ...(q && { searchMeta }),
            pagination: {
                total,
                page: parsedPage,
                limit: parsedLimit,
                pages: Math.ceil(total / parsedLimit)
            }
        });
    } catch (err) {
        // Log the detail, return none of it — driver messages exposed pipeline
        // internals ("$skip: nan.0") to any caller passing junk params.
        console.error('GetAllCompanies Error:', err);
        res.status(500).json({ msg: 'Server Error' });
    }
};

// @desc    Create a new company
// @route   POST /api/companies
const createCompany = async (req, res) => {
    try {
        const body = { ...req.body };
        const isAdmin = await isAdminUser(req.user);

        // Non-admin listings always start Pending, owned by whoever is signed in (if anyone)
        if (!isAdmin) {
            stripAdminOnlyFields(body);
            delete body.owner;
        }

        // Convert latitude/longitude to GeoJSON if provided
        if (body.latitude && body.longitude) {
            body.location = {
                type: 'Point',
                coordinates: [parseFloat(body.longitude), parseFloat(body.latitude)]
            };
        }

        // Sanitise sentinel values and resolve manual location entries
        await resolveManualLocation(body);


        // For logged-in non-admin users, assign them as owner and ensure they are at least a Brand Owner
        if (req.user && !isAdmin) {
            body.owner = req.user._id;
            
            // If they are a regular 'User', upgrade them so they can manage their brands
            if (req.user.role === 'User') {
                await User.findByIdAndUpdate(req.user._id, { role: 'Brand Owner' });
            }
        }

        // Fraud & Spam Detection
        const FraudAlert = require('../models/FraudAlert');
        const { realTimeFraudCheck } = require('./fraudController');
        
        const metadata = {
            ipAddress: req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress,
            userAgent: req.headers['user-agent']
        };

        const fraudResult = await realTimeFraudCheck('listing', body, req.user?._id, metadata);

        if (fraudResult.isSuspicious) {
            // Auto-flag the company but still create it as Pending
            body.verificationStatus = 'Flagged';
            body.status = 'Pending';
        }

        const company = new Company(body);
        await company.save();

        // Log to AdminAuditLog
        try {
            const AdminAuditLog = require('../models/AdminAuditLog');
            await AdminAuditLog.create({
                adminId: req.user?._id || company.owner || company._id,
                action: 'LISTING_CREATED',
                targetType: 'Listing',
                targetId: company._id,
                ipAddress: req.ip,
                userAgent: req.headers['user-agent'],
                notes: `Listing '${company.name}' created`
            });
        } catch (auditErr) {
            console.error('Failed to write company creation audit log:', auditErr.message);
        }

        if (fraudResult.isSuspicious) {
            // Create the fraud alert linked to the new company
            await FraudAlert.create({
                ...fraudResult.alertData,
                targetId: company._id,
                targetModel: 'Company',
                status: 'pending'
            });
        }

        const populatedCompany = await Company.findById(company._id)
            .populate('category_id', 'name slug image')
            .populate('city_id', 'name slug')
            .populate('state_id', 'name slug')
            .populate('area_id', 'name slug')
            .populate('owner', 'name email')
            .lean();

        res.status(201).json(populatedCompany);
    } catch (err) {
        console.error('Create Company Error:', err);
        res.status(500).json({ 
            msg: err.name === 'ValidationError' 
                ? Object.values(err.errors).map(e => e.message).join(', ') 
                : (err.code === 11000 ? `Duplicate value for ${Object.keys(err.keyValue).join(', ')}` : err.message || 'Server Error'), 
            error: err.message,
            stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
        });
    }
};

// @desc    Update a company
// @route   PUT /api/companies/:id
const updateCompany = async (req, res) => {
    try {
        let company = await Company.findById(req.params.id);
        if (!company) return res.status(404).json({ msg: 'Company not found' });

        // Brand owners may only update a company they own (unclaimed = owner null)
        if (isBrandScoped(req.user) && String(company.owner) !== String(req.user._id)) {
            return res.status(403).json({ msg: 'Not authorized to update this company' });
        }

        const body = { ...req.body };
        if (!(await isAdminUser(req.user))) stripAdminOnlyFields(body);
        // Sanitize fields
        ['country_id', 'state_id', 'city_id', 'area_id', 'category_id', 'owner', 'latitude', 'longitude', 'gstPan', 'gstNumber', 'subCategory', 'manualCountry', 'manualState', 'manualCity', 'manualArea'].forEach(field => {
            if (body[field] === '' || body[field] === 'manual') body[field] = null;
        });

        // Convert latitude/longitude to GeoJSON if provided
        if (body.latitude && body.longitude) {
            body.location = {
                type: 'Point',
                coordinates: [parseFloat(body.longitude), parseFloat(body.latitude)]
            };
        }

        // A brand owner must not be able to reassign their listing to someone else
        if (isBrandScoped(req.user)) {
            delete body.owner;
        }

        // Handle bidirectional owner assignment
        if (body.owner !== undefined && String(body.owner) !== String(company.owner)) {
            // Remove company link from previous owner
            if (company.owner) {
                await User.findByIdAndUpdate(company.owner, {
                    company: null,
                    companyId: null
                });
            }
            // Add company link to new owner
            if (body.owner) {
                await User.findByIdAndUpdate(body.owner, {
                    company: company._id,
                    companyId: company._id,
                    companiesOwned: 1
                });
            }
        }

        // Audit Trail Logic
        const trackFields = ['name', 'status', 'verified', 'verificationStatus', 'owner', 'manualRank', 'category_id', 'gstPan', 'gstNumber', 'yearEstablished', 'tagline', 'serviceRadius', 'logo', 'coverPhotoUrl', 'images', 'videos', 'brochures'];
        const changes = [];
        trackFields.forEach(field => {
            if (body[field] !== undefined && String(body[field]) !== String(company[field])) {
                changes.push({
                    field: field,
                    oldValue: company[field],
                    newValue: body[field],
                    changedBy: req.user._id
                });
            }
        });

        if (changes.length > 0) {
            await Company.findByIdAndUpdate(req.params.id, {
                $push: { changeHistory: { $each: changes } }
            });

            // Log to AdminAuditLog
            try {
                const AdminAuditLog = require('../models/AdminAuditLog');
                const beforeChanges = {};
                const afterChanges = {};
                const fieldChanged = [];
                changes.forEach(change => {
                    beforeChanges[change.field] = change.oldValue;
                    afterChanges[change.field] = change.newValue;
                    fieldChanged.push(change.field);
                });
                await AdminAuditLog.create({
                    adminId: req.user._id,
                    action: 'LISTING_EDITED',
                    targetType: 'Listing',
                    targetId: company._id,
                    changes: {
                        before: beforeChanges,
                        after: afterChanges,
                        fieldChanged
                    },
                    ipAddress: req.ip,
                    userAgent: req.headers['user-agent'],
                    notes: `Brand Owner ${req.user.name} updated listing '${company.name}'`
                });
            } catch (auditErr) {
                console.error('Failed to write company update audit log:', auditErr.message);
            }
        }

        company = await Company.findByIdAndUpdate(
            req.params.id,
            { $set: body },
            { new: true }
        )
        .populate('category_id', 'name slug image')
        .populate('city_id', 'name slug')
        .populate('state_id', 'name slug')
        .populate('area_id', 'name slug')
        .populate('owner', 'name email role')
        .lean();

        res.json(company);
    } catch (err) {
        console.error('Update Company Error:', err.message);
        if (err.kind === 'ObjectId') return res.status(404).json({ msg: 'Company not found' });
        res.status(500).json({ msg: 'Server Error', error: err.message });
    }
};

// @desc    Delete a company
// @route   DELETE /api/companies/:id
const deleteCompany = async (req, res) => {
    try {
        const company = await Company.findById(req.params.id);
        if (!company) return res.status(404).json({ msg: 'Company not found' });

        // Brand owners may only delete a company they own (unclaimed = owner null)
        if (isBrandScoped(req.user) && String(company.owner) !== String(req.user._id)) {
            return res.status(403).json({ msg: 'Not authorized to delete this company' });
        }

        await Company.findByIdAndDelete(req.params.id);
        res.json({ msg: 'Company removed' });
    } catch (err) {
        console.error(err.message);
        if (err.kind === 'ObjectId') return res.status(404).json({ msg: 'Company not found' });
        res.status(500).json({ msg: 'Server Error' });
    }
};

// @desc    Get company by slug
// @route   GET /api/companies/slug/:slug
const getCompanyBySlug = async (req, res) => {
    try {
        let company = await Company.findOne({ slug: req.params.slug })
            .populate('category_id', 'name slug image')
            .populate('country_id', 'name slug')
            .populate('city_id', 'name slug')
            .populate('state_id', 'name slug')
            .populate('area_id', 'name slug')
            .populate('owner', 'name email role');

        if (!company) {
            company = await Company.findOne({ slug: new RegExp(`^${req.params.slug}$`, 'i') })
                .populate('category_id', 'name slug image')
                .populate('country_id', 'name slug')
                .populate('city_id', 'name slug')
                .populate('state_id', 'name slug')
                .populate('area_id', 'name slug')
                .populate('owner', 'name email role');
        }

        if (!company) {
            return res.status(404).json({ msg: 'Company not found' });
        }

        const Product = require('../models/Product');
        const Service = require('../models/Service');

        const [products, services] = await Promise.all([
            Product.find({ listingId: company._id, status: 'Active' })
                .populate('categoryId', 'name slug')
                .populate('subCategoryId', 'name slug')
                .populate('brandId', 'name slug')
                .lean(),
            Service.find({ listingId: company._id, status: 'Active' })
                .populate('categoryId', 'name slug')
                .populate('subCategoryId', 'name slug')
                .lean()
        ]);

        const companyObj = company.toObject();
        companyObj.products = products;
        companyObj.services = services;

        // Filter approved photos and populate photos array & cover image for frontend
        try {
            const rawImages = (companyObj.images || []).filter(Boolean);
            const approvedImages = rawImages.filter(img =>
                typeof img === 'object' && img !== null ? (img.status === 'Approved' || !img.status) : true
            );
            const photoUrls = approvedImages.map(img => (typeof img === 'object' && img !== null ? img.url : img)).filter(Boolean);
            const coverObj = approvedImages.find(img => typeof img === 'object' && img !== null && img.isCover) || approvedImages[0];
            const fallbackImage = companyObj.category_id?.image || null;
            const coverUrl = companyObj.image || (coverObj ? (typeof coverObj === 'object' && coverObj !== null ? coverObj.url : coverObj) : null) || fallbackImage;

            companyObj.photos = photoUrls;
            companyObj.image = coverUrl;
        } catch (imgErr) {
            console.error('Error formatting company images:', imgErr);
        }

        res.json(companyObj);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
};

// @desc    Claim a company
// @route   POST /api/companies/:id/claim
const claimCompany = async (req, res) => {
    try {
        const company = await Company.findById(req.params.id);

        if (!company) {
            return res.status(404).json({ msg: 'Company not found' });
        }

        if (company.claimed) {
            return res.status(400).json({ msg: 'This company is already claimed' });
        }

        // Assign current user as owner
        company.owner = req.user._id;
        company.claimed = true;
        // Optional: Keep verified false until admin reviews the claim
        // company.verified = false; 

        await company.save();

        const populatedCompany = await Company.findById(company._id)
            .populate('category_id', 'name slug image')
            .populate('owner', 'name email role')
            .lean();

        res.json({
            success: true,
            msg: 'Company claimed successfully!',
            company: populatedCompany
        });
    } catch (err) {
        console.error('Claim Company Error:', err.message);
        res.status(500).json({ msg: 'Server Error', error: err.message });
    }
};

// @desc    Autocomplete for search (Keywords, Categories, Companies)
// @route   GET /api/companies/autocomplete
// @access  Public
const autocomplete = async (req, res) => {
    try {
        const { q } = req.query;
        if (!q || q.length < 2) return res.json([]);

        const term = q.trim();
        const escaped = escapeRegex(term);
        // Literal substring match — the tier that actually matters. Fuzzy
        // (subsequence) matching is only a fallback, because "cnc" fuzzily
        // matches "pa-c-kagi-n-g a-c-cessories" and used to outrank
        // "Precision CNC Works".
        const substring = new RegExp(escaped, 'i');

        const Product = require('../models/Product');
        // Individual keyword values matching the term, from an array field. Unwinding first
        // means the suggestion is the keyword itself, not the whole document's keyword list.
        const matchingKeywords = (Model, field, match) => Model.aggregate([
            { $match: { ...match, [field]: substring } },
            { $unwind: `$${field}` },
            { $match: { [field]: substring } },
            { $group: { _id: { $toLower: { $trim: { input: `$${field}` } } }, text: { $first: { $trim: { input: `$${field}` } } } } },
            { $limit: AUTOCOMPLETE_FETCH_LIMIT }
        ]);

        const [categories, companies, products, productKeywords, companyTags] = await Promise.all([
            Category.find({ name: substring }).limit(AUTOCOMPLETE_FETCH_LIMIT).select('name slug -_id').lean(),
            Company.find({ name: substring, status: { $in: ['Approved', 'Active'] } }).limit(AUTOCOMPLETE_FETCH_LIMIT).select('name slug -_id').lean(),
            Product.find({ name: substring, status: 'Active' }).limit(AUTOCOMPLETE_FETCH_LIMIT).select('name slug -_id').lean(),
            matchingKeywords(Product, 'keywords', { status: 'Active' }),
            matchingKeywords(Company, 'tags', { status: { $in: ['Approved', 'Active'] } })
        ]);

        // One Keyword row per distinct word, whichever source it came from
        const keywordMap = new Map();
        [...productKeywords, ...companyTags].forEach(k => {
            if (k._id && !keywordMap.has(k._id)) keywordMap.set(k._id, k.text);
        });

        let results = [
            ...categories.map(c => ({ text: c.name, slug: c.slug, type: 'Category' })),
            ...[...keywordMap.values()].map(text => ({ text, type: 'Keyword' })),
            ...products.map(p => ({ text: p.name, slug: p.slug, type: 'Product' })),
            ...companies.map(c => ({ text: c.name, slug: c.slug, type: 'Business' }))
        ];

        // Only reach for fuzzy when literal matching came up short, so typo
        // tolerance is preserved without polluting good result sets.
        if (results.length < AUTOCOMPLETE_LIMIT) {
            const fuzzy = new RegExp(createFuzzyRegex(term), 'i');
            const seen = new Set(results.map(r => `${r.type}:${r.text}`));

            const [fuzzyCategories, fuzzyCompanies] = await Promise.all([
                Category.find({ name: fuzzy }).limit(AUTOCOMPLETE_FETCH_LIMIT).select('name slug -_id').lean(),
                Company.find({ name: fuzzy, status: { $in: ['Approved', 'Active'] } }).limit(AUTOCOMPLETE_FETCH_LIMIT).select('name slug -_id').lean()
            ]);

            const extra = [
                ...fuzzyCategories.map(c => ({ text: c.name, slug: c.slug, type: 'Category' })),
                ...fuzzyCompanies.map(c => ({ text: c.name, slug: c.slug, type: 'Business' }))
            ].filter(r => !seen.has(`${r.type}:${r.text}`));

            results = results.concat(extra.slice(0, AUTOCOMPLETE_MAX_FUZZY));
        }

        results.sort((a, b) => {
            const rankDiff = matchRank(a.text, term) - matchRank(b.text, term);
            if (rankDiff !== 0) return rankDiff;
            // Within a tier, the shorter name is the closer match
            // ("CNC Machine" before "Precision CNC Works Pvt Ltd").
            if (a.text.length !== b.text.length) return a.text.length - b.text.length;
            return a.text.localeCompare(b.text);
        });

        res.json(results.slice(0, AUTOCOMPLETE_LIMIT));
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
};

// @desc    Get similar businesses
// @route   GET /api/companies/:id/similar
const getSimilarBusinesses = async (req, res) => {
    try {
        const company = await Company.findById(req.params.id);
        if (!company) return res.status(404).json({ msg: 'Company not found' });

        let similar = await Company.find({
            _id: { $ne: company._id },
            category_id: company.category_id,
            city_id: company.city_id
        })
        .populate('category_id', 'name slug image')
        .sort({ rating: -1, reviewCount: -1 })
        .limit(6)
        .lean();

        similar = similar.map(s => {
            if (!s.image) {
                s.image = s.category_id?.image || null;
            }
            return s;
        });

        res.json(similar);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

// @desc    Get questions for a business
// @route   GET /api/companies/:id/questions
const getQuestions = async (req, res) => {
    try {
        const Question = require('../models/Question');
        const questions = await Question.find({ businessId: req.params.id })
            .populate('userId', 'name')
            .sort({ createdAt: -1 })
            .lean();
        res.json(questions);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

// @desc    Post a question
// @route   POST /api/companies/:id/questions
const postQuestion = async (req, res) => {
    try {
        const Question = require('../models/Question');
        const newQuestion = new Question({
            businessId: req.params.id,
            userId: req.user._id,
            questionText: req.body.questionText
        });
        await newQuestion.save();
        res.json(newQuestion);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};
const getCompanyById = async (req, res) => {
    try {
        const company = await Company.findById(req.params.id)
            .populate('category_id', 'name slug image')
            .populate('city_id', 'name slug')
            .populate('area_id', 'name slug');
        if (!company) return res.status(404).json({ msg: 'Company not found' });
        
        const companyObj = company.toObject();
        if (!companyObj.image) {
            companyObj.image = companyObj.category_id?.image || null;
        }
        res.json(companyObj);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

// @desc    Report a business
// @route   POST /api/companies/:id/report
const reportCompany = async (req, res) => {
    try {
        const FraudAlert = require('../models/FraudAlert');
        const { reason, description } = req.body;

        const report = new FraudAlert({
            type: 'listing',
            severity: 'medium',
            reason,
            description,
            targetId: req.params.id,
            targetModel: 'Company',
            metadata: {
                ipAddress: req.ip,
                userAgent: req.get('user-agent')
            }
        });

        await report.save();
        res.status(201).json({ success: true, msg: 'Report submitted successfully' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

// @desc    Get companies owned by the logged-in user
// @route   GET /api/companies/my-companies
const getMyCompanies = async (req, res) => {
    try {
        if (!req.user) return res.status(401).json({ msg: 'Not authorized' });
        
        const companies = await Company.find({ owner: req.user._id })
            .populate('category_id', 'name slug image')
            .populate('city_id', 'name slug')
            .populate('state_id', 'name slug')
            .populate('area_id', 'name slug')
            .sort({ createdAt: -1 })
            .lean();

        const updatedCompanies = companies.map(company => {
            if (!company.image) {
                company.image = company.category_id?.image || null;
            }
            return company;
        });

        res.json({
            success: true,
            count: updatedCompanies.length,
            data: updatedCompanies
        });
    } catch (err) {
        console.error('GetMyCompanies Error:', err.message);
        res.status(500).json({ msg: 'Server Error', error: err.message });
    }
};

// @desc    Import business from OSM
// @route   POST /api/companies/import-osm
const importOSM = async (req, res) => {
    try {
        const osmData = req.body;

        // 1. Basic validation
        if (!osmData.name || !osmData.lat || !osmData.lng) {
            return res.status(400).json({ msg: 'Invalid OSM data provided' });
        }

        // 2. Map Category (Try to match existing category by name)
        let category_id = null;
        let categoryName = osmData.category || 'Other';
        
        const existingCategory = await Category.findOne({ 
            name: new RegExp(`^${categoryName}$`, 'i') 
        });
        
        if (existingCategory) {
            category_id = existingCategory._id;
        }

        // 3. Prepare Company Object
        const companyData = {
            name: osmData.name,
            category: categoryName,
            category_id,
            address: osmData.address,
            latitude: osmData.lat,
            longitude: osmData.lng,
            phone: osmData.phone,
            email: osmData.email,
            website: osmData.website,
            status: 'Pending', // Imported data needs verification
            location: {
                type: 'Point',
                coordinates: [osmData.lng, osmData.lat]
            },
            tags: [osmData.amenityTag, categoryName].filter(Boolean),
            businessHours: {}, // OSM hours format is different, skip for now or add parser later
            description: `Imported from OpenStreetMap (OSM ID: ${osmData.osmId})`,
            verified: false
        };

        // 4. Check for duplicates (by name + coordinates proximity)
        const duplicate = await Company.findOne({
            name: new RegExp(`^${osmData.name}$`, 'i'),
            location: {
                $near: {
                    $geometry: { type: "Point", coordinates: [osmData.lng, osmData.lat] },
                    $maxDistance: 100 // 100 meters
                }
            }
        });

        if (duplicate) {
            return res.status(409).json({ msg: 'Business already exists in system', id: duplicate._id });
        }

        // 5. Save
        const company = new Company(companyData);
        await company.save();

        res.status(201).json({
            success: true,
            msg: 'Business imported successfully',
            data: company
        });
    } catch (err) {
        console.error('Import OSM Error:', err.message);
        res.status(500).json({ msg: 'Server Error', error: err.message });
    }
};

// @desc    Get all questions for brand owner's businesses
// @route   GET /api/companies/questions/brand
// @access  Private (Brand Owner)
const getBrandQuestions = async (req, res) => {
    try {
        const Question = require('../models/Question');
        const Company = require('../models/Company');

        // Find all companies owned by this user or matching their companyId
        const query = {
            $or: [
                { owner: req.user.id }
            ]
        };
        if (req.user.companyId) {
            query.$or.push({ _id: req.user.companyId });
        }

        const companies = await Company.find(query);
        const companyIds = companies.map(c => c._id);

        const questions = await Question.find({ businessId: { $in: companyIds } })
            .populate('userId', 'name email image')
            .populate('businessId', 'name slug')
            .sort({ createdAt: -1 });

        res.json(questions);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
};

// @desc    Answer a business question (Owner)
// @route   PUT /api/companies/questions/:id/answer
// @access  Private (Owner)
const answerQuestion = async (req, res) => {
    try {
        const { answerText } = req.body;
        if (!answerText) return res.status(400).json({ msg: 'Answer text is required' });

        const Question = require('../models/Question');
        const Company = require('../models/Company');

        const question = await Question.findById(req.params.id);
        if (!question) return res.status(404).json({ msg: 'Question not found' });

        // Verify ownership
        const company = await Company.findById(question.businessId);
        if (!company) return res.status(404).json({ msg: 'Company not found' });

        if (company.owner.toString() !== req.user.id && req.user.role !== 'Super Admin' && req.user.role !== 'Admin') {
            return res.status(403).json({ msg: 'Not authorized to answer this question' });
        }

        question.answerText = answerText;
        question.isAnswered = true;
        question.answeredBy = req.user.id;
        question.answeredAt = new Date();

        await question.save();
        res.json(question);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
};

// @desc    Get all questions platform-wide (Admin)
// @route   GET /api/companies/questions/admin
// @access  Private (Admin)
const getAdminQuestions = async (req, res) => {
    try {
        const Question = require('../models/Question');

        if (req.user.role !== 'Super Admin' && req.user.role !== 'Admin') {
            return res.status(403).json({ msg: 'Not authorized' });
        }

        const questions = await Question.find()
            .populate('userId', 'name email image')
            .populate('businessId', 'name slug')
            .sort({ createdAt: -1 });

        res.json(questions);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
};

// @desc    Delete a question (Admin)
// @route   DELETE /api/companies/questions/:id
// @access  Private (Admin)
const deleteQuestion = async (req, res) => {
    try {
        const Question = require('../models/Question');

        if (req.user.role !== 'Super Admin' && req.user.role !== 'Admin') {
            return res.status(403).json({ msg: 'Not authorized' });
        }

        const question = await Question.findById(req.params.id);
        if (!question) return res.status(404).json({ msg: 'Question not found' });

        await question.deleteOne();
        res.json({ msg: 'Question successfully deleted' });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
};

// @desc    Download a listing's brochure as a file attachment (and log a download_brochure event)
// @route   GET /api/companies/:id/brochures/:brochureId/download
// @access  Public
const downloadBrochure = async (req, res) => {
    try {
        const { id, brochureId } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(brochureId)) {
            return res.status(404).json({ msg: 'Brochure not found' });
        }

        const company = await Company.findById(id).select('brochures');
        const brochure = company?.brochures?.id(brochureId);
        if (!brochure) return res.status(404).json({ msg: 'Brochure not found' });

        // ?inline=1 is the owner's "Preview" in the brand panel: show in the browser, don't count it
        const inline = req.query.inline === '1';
        if (!inline) {
            try {
                const AnalyticsEvent = require('../models/AnalyticsEvent');
                await AnalyticsEvent.create({
                    eventType: 'download_brochure',
                    businessId: company._id,
                    sessionId: req.ip || 'anonymous-session',
                    metadata: { brochureId: String(brochure._id), brochureName: brochure.name }
                });
            } catch (logErr) {
                console.error('Failed to log brochure download:', logErr.message);
            }
        }

        // brochures[].url is brand owner-writable via PUT /companies/:id, so only proxy files we
        // host on Cloudinary — anything else is redirected instead of fetched server-side (SSRF).
        let parsed;
        try { parsed = new URL(brochure.url); } catch { parsed = null; }
        if (!parsed || !['http:', 'https:'].includes(parsed.protocol)) {
            return res.status(404).json({ msg: 'Brochure not found' });
        }
        if (parsed.protocol !== 'https:' || parsed.hostname !== 'res.cloudinary.com') {
            return res.redirect(parsed.href);
        }

        // Public PDF delivery is blocked on this Cloudinary account (401 "deny or ACL failure"),
        // so fetch through the authenticated download API instead. The public_id is taken from
        // the URL and must sit in the brochures folder, so a tampered URL can't pull other assets.
        const { cloudinary } = require('../config/cloudinary');
        const match = parsed.pathname.match(/^\/[^/]+\/raw\/upload\/(?:v\d+\/)?(.+)$/);
        const publicId = match ? decodeURIComponent(match[1]) : null;
        if (!publicId || !publicId.startsWith('fuertedevelopers/brochures/')) {
            return res.status(404).json({ msg: 'Brochure not found' });
        }
        const downloadUrl = cloudinary.utils.private_download_url(publicId, '', { resource_type: 'raw', type: 'upload' });

        const upstream = await fetch(downloadUrl);
        if (!upstream.ok || !upstream.body) {
            console.error('Brochure fetch failed:', upstream.status, upstream.headers.get('x-cld-error'));
            return res.status(502).json({ msg: 'Brochure file is unavailable right now' });
        }

        const baseName = (brochure.name || 'brochure').replace(/\.pdf$/i, '');
        const asciiName = baseName.replace(/[^\x20-\x7E]/g, '').replace(/["\\]/g, '').trim() || 'brochure';
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader(
            'Content-Disposition',
            `${inline ? 'inline' : 'attachment'}; filename="${asciiName}.pdf"; filename*=UTF-8''${encodeURIComponent(baseName)}.pdf`
        );
        const length = upstream.headers.get('content-length');
        if (length) res.setHeader('Content-Length', length);

        const { Readable } = require('stream');
        Readable.fromWeb(upstream.body).pipe(res);
    } catch (err) {
        console.error('Brochure download error:', err.message);
        if (!res.headersSent) res.status(500).json({ msg: 'Server Error' });
    }
};

module.exports = {
    downloadBrochure,
    getAllCompanies,
    createCompany, 
    updateCompany, 
    deleteCompany, 
    getCompanyBySlug, 
    getCompanyById,
    getMyCompanies,
    claimCompany, 
    autocomplete,
    getSimilarBusinesses,
    getQuestions,
    postQuestion,
    reportCompany,
    importOSM,
    getBrandQuestions,
    answerQuestion,
    getAdminQuestions,
    deleteQuestion
};
