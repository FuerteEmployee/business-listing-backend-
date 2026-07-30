const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const slugify = require('slugify');

const Company = require('../models/Company');
const Category = require('../models/Category');
const User = require('../models/User');
const Country = require('../models/Country');
const State = require('../models/State');
const City = require('../models/City');
const Area = require('../models/Area');
const Plan = require('../models/Plan');
const RBACRole = require('../models/RBACRole');
const AdminAuditLog = require('../models/AdminAuditLog');

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

const LISTING_STATUSES = ['Pending', 'Approved', 'Rejected', 'Active', 'Inactive', 'Flagged', 'Suspended'];
const APPROVAL_STAGES = ['AwaitingReview', 'UnderReview', 'MoreInfoRequested', 'Approved', 'Rejected'];
const VERIFICATION_STATUSES = ['Verified', 'Not Verified', 'Pending Review', 'Flagged'];
const USER_STATUSES = ['Active', 'Suspended', 'Banned', 'Unverified'];
const PRICE_RANGES = ['$', '$$', '$$$', '$$$$'];

const str = (v) => (v === undefined || v === null ? '' : String(v).trim());
const norm = (v) => str(v).toLowerCase();

/** Match a sheet value against an enum, case-insensitively. Returns null when absent/unknown. */
const matchEnum = (value, allowed) => {
    const wanted = norm(value);
    if (!wanted) return null;
    return allowed.find(a => a.toLowerCase() === wanted) || null;
};

const parseBool = (value, fallback = false) => {
    const v = norm(value);
    if (!v) return fallback;
    if (['yes', 'y', 'true', '1', 'active', 'verified', 'enabled'].includes(v)) return true;
    if (['no', 'n', 'false', '0', 'inactive', 'disabled'].includes(v)) return false;
    return fallback;
};

const parseNumber = (value) => {
    const v = str(value);
    if (!v) return null;
    const n = Number(v.replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
};

/** Multi-value cells accept pipe, comma, semicolon or newline separators. */
const parseList = (value) => str(value)
    .split(/[|;,\n]/)
    .map(s => s.trim())
    .filter(Boolean);

/**
 * Business-hours cell formats: "09:00-18:00", "9:00 - 18:00", "Closed", "24 Hours", or blank.
 * Blank leaves the day unset so it inherits whatever the UI shows for "not configured".
 */
const parseHours = (value) => {
    const v = str(value);
    if (!v) return null;
    if (/^closed$/i.test(v)) return { closed: true };
    if (/^(24 ?hours?|24x7|24\/7|open)$/i.test(v)) return { open: '00:00', close: '23:59', closed: false };

    const match = v.match(/^(\d{1,2}:\d{2})\s*(?:-|to|–)\s*(\d{1,2}:\d{2})$/i);
    if (!match) return null;
    const pad = (t) => (t.length === 4 ? `0${t}` : t);
    return { open: pad(match[1]), close: pad(match[2]), closed: false };
};

const randomPassword = () => `Biz${crypto.randomBytes(6).toString('hex')}!`;

const hashPassword = async (plain) => bcrypt.hash(plain, await bcrypt.genSalt(10));

const uniqueSlug = (base, taken, fallback) => {
    const root = slugify(base || '', { lower: true, strict: true }) || fallback;
    let candidate = root;
    let suffix = 1;
    while (taken.has(candidate)) candidate = `${root}-${suffix++}`;
    return candidate;
};

/** Same resolution rules as checkPermission middleware, but non-throwing so we can skip a sheet. */
const hasPermission = async (user, module, action) => {
    if (!user || !user.role) return false;
    if (user.role === 'Super Admin') return true;
    const role = await RBACRole.findOne({ name: user.role });
    return !!(role && role.permissions && role.permissions[module] && role.permissions[module][action] === true);
};

const emptySheetResult = () => ({ created: 0, updated: 0, skipped: 0, failed: 0, messages: [] });

const note = (result, row, name, message, level = 'error') => {
    result.messages.push({ row, name, level, message });
};

/**
 * @desc    Import categories, users and listings from one parsed spreadsheet.
 *          Sheets are processed in dependency order so listings can reference
 *          categories and owners created earlier in the same file.
 * @route   POST /api/admin/import
 * @access  Private (listingManagement:write; the users sheet additionally
 *          requires userManagement:write and is skipped without it)
 */
exports.bulkImport = async (req, res) => {
    try {
        const categoryRows = Array.isArray(req.body.categories) ? req.body.categories : [];
        const userRows = Array.isArray(req.body.users) ? req.body.users : [];
        const listingRows = Array.isArray(req.body.listings) ? req.body.listings : [];

        if (!categoryRows.length && !userRows.length && !listingRows.length) {
            return res.status(400).json({ success: false, msg: 'Nothing to import: the file contained no data rows.' });
        }

        // Options (all default to the forgiving behaviour the admin UI expects)
        const opts = req.body.options || {};
        const autoCreateCategories = opts.autoCreateCategories !== false;
        const autoCreateOwners = opts.autoCreateOwners !== false;
        const updateExisting = opts.updateExisting !== false;

        const results = {
            categories: emptySheetResult(),
            users: emptySheetResult(),
            listings: emptySheetResult()
        };
        const generatedCredentials = [];

        // ---------- Reference data, loaded once ----------
        const [categories, users, countries, states, cities, areas, plans] = await Promise.all([
            Category.find({}),
            User.find({}).select('+password'),
            Country.find({}),
            State.find({}),
            City.find({}),
            Area.find({}),
            Plan.find({})
        ]);

        const categorySlugs = new Set(categories.map(c => c.slug).filter(Boolean));
        const userEmails = new Set(users.map(u => u.email).filter(Boolean));

        const findCategory = (text) => {
            const wanted = norm(text);
            if (!wanted) return null;
            return categories.find(c => norm(c.name) === wanted || norm(c.slug) === wanted)
                || categories.find(c => norm(c.name).includes(wanted));
        };
        const findUser = (email, name) => {
            const wantedEmail = norm(email);
            if (wantedEmail) {
                const byEmail = users.find(u => norm(u.email) === wantedEmail);
                if (byEmail) return byEmail;
            }
            const wantedName = norm(name);
            if (!wantedName) return null;
            return users.find(u => norm(u.name) === wantedName)
                || (wantedName.length >= 4 ? users.find(u => norm(u.name).includes(wantedName)) : null);
        };
        const findByName = (collection, text, extraFilter) => {
            const wanted = norm(text);
            if (!wanted) return null;
            return collection.find(item => norm(item.name) === wanted && (!extraFilter || extraFilter(item)))
                || null;
        };

        // ==================== 1. CATEGORIES ====================
        if (categoryRows.length) {
            {
                // Categories live under listingManagement, already enforced by the route.
                // Pass 1 - create/update without parents (a parent may appear further down the sheet).
                const parentLinks = [];
                for (let i = 0; i < categoryRows.length; i++) {
                    const row = categoryRows[i];
                    const rowNo = row.__row || i + 2;
                    try {
                        const name = str(row.name);
                        if (!name) throw new Error('Category Name is required');

                        const existing = findCategory(name);
                        const status = matchEnum(row.status, ['Active', 'Inactive']) || 'Active';
                        const image = str(row.image) || null;

                        if (existing) {
                            if (!updateExisting) {
                                results.categories.skipped++;
                            } else {
                                existing.status = status;
                                if (image) existing.image = image;
                                await existing.save();
                                results.categories.updated++;
                            }
                            if (str(row.parent)) parentLinks.push({ doc: existing, parent: str(row.parent), rowNo, name });
                            continue;
                        }

                        const slug = uniqueSlug(str(row.slug) || name, categorySlugs, 'category');
                        categorySlugs.add(slug);

                        const created = await Category.create({ name, slug, status, image });
                        categories.push(created);
                        results.categories.created++;
                        if (str(row.parent)) parentLinks.push({ doc: created, parent: str(row.parent), rowNo, name });
                    } catch (err) {
                        results.categories.failed++;
                        note(results.categories, rowNo, str(row.name) || 'Unknown', err.message);
                    }
                }

                // Pass 2 - link parents now that every category in the sheet exists.
                for (const link of parentLinks) {
                    const parent = findCategory(link.parent);
                    if (!parent) {
                        note(results.categories, link.rowNo, link.name,
                            `Parent category "${link.parent}" not found - left as a top-level category.`, 'warning');
                        continue;
                    }
                    if (String(parent._id) === String(link.doc._id)) {
                        note(results.categories, link.rowNo, link.name,
                            'A category cannot be its own parent - left as a top-level category.', 'warning');
                        continue;
                    }
                    link.doc.parent = parent._id;
                    await link.doc.save();
                }
            }
        }

        // ==================== 2. USERS ====================
        if (userRows.length) {
            if (!(await hasPermission(req.user, 'userManagement', 'write'))) {
                results.users.skipped = userRows.length;
                note(results.users, null, null,
                    'Users sheet skipped: your role lacks userManagement write permission.', 'warning');
            } else {
                for (let i = 0; i < userRows.length; i++) {
                    const row = userRows[i];
                    const rowNo = row.__row || i + 2;
                    try {
                        const name = str(row.name);
                        const email = norm(row.email);
                        if (!name) throw new Error('Full Name is required');
                        if (!email) throw new Error('Email Address is required');
                        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error(`"${email}" is not a valid email address`);

                        const role = str(row.role) || 'User';
                        const status = matchEnum(row.status, USER_STATUSES) || 'Active';
                        const mobile = str(row.mobileNumber);
                        const existing = users.find(u => norm(u.email) === email);

                        if (existing) {
                            if (!updateExisting) {
                                results.users.skipped++;
                                continue;
                            }
                            // Passwords of existing accounts are never overwritten by an import.
                            existing.name = name;
                            existing.role = role;
                            existing.status = status;
                            if (mobile && !existing.mobileNumber) existing.mobileNumber = mobile;
                            if (str(row.location)) existing.location = str(row.location);
                            if (str(row.profilePhoto)) existing.profilePhoto = str(row.profilePhoto);
                            if (str(row.adminNotes)) existing.adminNotes = str(row.adminNotes);
                            if (str(row.isEmailVerified)) existing.isEmailVerified = parseBool(row.isEmailVerified, existing.isEmailVerified);
                            const score = parseNumber(row.performanceScore);
                            if (score !== null) existing.performanceScore = score;
                            await existing.save();
                            results.users.updated++;
                            if (mobile && existing.mobileNumber !== mobile) {
                                note(results.users, rowNo, name,
                                    'Existing mobile number kept; sheet value ignored.', 'warning');
                            }
                            continue;
                        }

                        const suppliedPassword = str(row.password);
                        const plainPassword = suppliedPassword || randomPassword();
                        const fields = {
                            name,
                            email,
                            password: await hashPassword(plainPassword),
                            role,
                            status,
                            isEmailVerified: parseBool(row.isEmailVerified, true)
                        };
                        if (mobile) fields.mobileNumber = mobile;
                        if (str(row.location)) fields.location = str(row.location);
                        if (str(row.profilePhoto)) fields.profilePhoto = str(row.profilePhoto);
                        if (str(row.adminNotes)) fields.adminNotes = str(row.adminNotes);
                        const score = parseNumber(row.performanceScore);
                        if (score !== null) fields.performanceScore = score;

                        const created = await User.create(fields);
                        users.push(created);
                        userEmails.add(email);
                        results.users.created++;
                        if (!suppliedPassword) {
                            generatedCredentials.push({ name, email, password: plainPassword });
                        }
                    } catch (err) {
                        results.users.failed++;
                        const reason = err.code === 11000
                            ? `Duplicate value for ${Object.keys(err.keyPattern || {}).join(', ') || 'a unique field'}`
                            : err.message;
                        note(results.users, rowNo, str(row.name) || str(row.email) || 'Unknown', reason);
                    }
                }
            }
        }

        // ==================== 3. LISTINGS ====================
        for (let i = 0; i < listingRows.length; i++) {
            const row = listingRows[i];
            const rowNo = row.__row || i + 2;
            const rowName = str(row.name) || 'Unknown';
            try {
                const name = str(row.name);
                if (!name) throw new Error('Business Name is required');

                // ---- Category (required by the Company schema) ----
                const categoryText = str(row.category);
                if (!categoryText) throw new Error('Primary Category is required');

                let category = findCategory(categoryText);
                if (!category) {
                    if (!autoCreateCategories) throw new Error(`Category "${categoryText}" does not exist`);
                    const slug = uniqueSlug(categoryText, categorySlugs, 'category');
                    categorySlugs.add(slug);
                    category = await Category.create({ name: categoryText, slug, status: 'Active' });
                    categories.push(category);
                    note(results.listings, rowNo, name,
                        `Category "${categoryText}" did not exist and was created.`, 'info');
                }

                // ---- Owner ----
                let owner_id = null;
                const ownerEmail = norm(row.ownerEmail);
                const ownerName = str(row.ownerName);
                if (ownerEmail || ownerName) {
                    const matched = findUser(ownerEmail, ownerName);
                    if (matched) {
                        owner_id = matched._id;
                        const phone = str(row.phone);
                        if (phone && !matched.mobileNumber) {
                            matched.mobileNumber = phone;
                            await matched.save();
                        }
                    } else if (ownerEmail && autoCreateOwners) {
                        const plainPassword = randomPassword();
                        const createdOwner = await User.create({
                            name: ownerName || ownerEmail.split('@')[0],
                            email: ownerEmail,
                            password: await hashPassword(plainPassword),
                            role: 'Merchant',
                            status: 'Active',
                            isEmailVerified: true,
                            ...(str(row.phone) ? { mobileNumber: str(row.phone) } : {})
                        });
                        users.push(createdOwner);
                        userEmails.add(ownerEmail);
                        owner_id = createdOwner._id;
                        generatedCredentials.push({ name: createdOwner.name, email: ownerEmail, password: plainPassword });
                        note(results.listings, rowNo, name,
                            `Owner account created for ${ownerEmail} - see the credentials list below.`, 'info');
                    } else {
                        note(results.listings, rowNo, name,
                            `Owner "${ownerName || ownerEmail}" was not found. Add them to the Users sheet (or supply Owner Email) - listing imported as unclaimed.`,
                            'warning');
                    }
                }

                // ---- Location chain: Country > State > City > Area ----
                const country = findByName(countries, row.country);
                let state = findByName(states, row.state, s => !country || String(s.country_id) === String(country._id));
                let city = findByName(cities, row.city, c => !state || String(c.state_id) === String(state._id));
                if (!state && city) state = states.find(s => String(s._id) === String(city.state_id)) || null;
                const area = findByName(areas, row.area, a => !city || String(a.city_id) === String(city._id));
                if (!city && area) city = cities.find(c => String(c._id) === String(area.city_id)) || null;

                for (const [label, raw, resolved] of [
                    ['Country', row.country, country],
                    ['State', row.state, state],
                    ['City', row.city, city],
                    ['Area', row.area, area]
                ]) {
                    if (str(raw) && !resolved) {
                        note(results.listings, rowNo, name,
                            `${label} "${str(raw)}" is not in the location master - left blank.`, 'warning');
                    }
                }

                const plan = findByName(plans, row.plan);
                if (str(row.plan) && !plan) {
                    note(results.listings, rowNo, name, `Plan "${str(row.plan)}" not found - left unassigned.`, 'warning');
                }

                // ---- Business hours ----
                const businessHours = {};
                for (const day of DAYS) {
                    const parsed = parseHours(row[`hours_${day}`]);
                    if (parsed) businessHours[day] = parsed;
                    else if (str(row[`hours_${day}`])) {
                        note(results.listings, rowNo, name,
                            `${day} hours "${str(row[`hours_${day}`])}" not understood - expected "09:00-18:00" or "Closed".`, 'warning');
                    }
                }

                // ---- Media ----
                const gallery = parseList(row.galleryImages).map((url, idx) => ({
                    url,
                    isCover: idx === 0,
                    order: idx,
                    status: 'Approved'
                }));

                const latitude = parseNumber(row.latitude);
                const longitude = parseNumber(row.longitude);
                const status = matchEnum(row.status, LISTING_STATUSES) || 'Active';
                const stage = matchEnum(row.approvalStage, APPROVAL_STAGES)
                    || (['Approved', 'Active'].includes(status) ? 'Approved' : 'AwaitingReview');

                const data = {
                    name,
                    category: category.name,
                    category_id: category._id,
                    subCategory: str(row.subCategory) || null,
                    description: str(row.description),
                    tagline: str(row.tagline).slice(0, 100),
                    country_id: country ? country._id : null,
                    state_id: state ? state._id : null,
                    city_id: city ? city._id : null,
                    area_id: area ? area._id : null,
                    address: str(row.address),
                    phone: str(row.phone),
                    email: norm(row.email),
                    website: norm(row.website),
                    whatsapp: str(row.whatsapp),
                    gstPan: str(row.gstPan) || null,
                    bookingUrl: str(row.bookingUrl),
                    status,
                    approvalStatus: {
                        stage,
                        reviewedBy: req.user?._id,
                        reviewedAt: new Date()
                    },
                    owner: owner_id,
                    claimed: !!owner_id,
                    plan: plan ? plan._id : null,
                    verified: parseBool(row.verified, false),
                    verificationStatus: matchEnum(row.verificationStatus, VERIFICATION_STATUSES)
                        || (parseBool(row.verified, false) ? 'Verified' : 'Not Verified'),
                    businessBadgeVerified: parseBool(row.businessBadgeVerified, false),
                    isFeatured: parseBool(row.isFeatured, false),
                    priceRange: matchEnum(row.priceRange, PRICE_RANGES) || '$$',
                    tags: parseList(row.tags),
                    languages: parseList(row.languages),
                    paymentMethods: parseList(row.paymentMethods),
                    socialLinks: {
                        facebook: str(row.facebook),
                        instagram: str(row.instagram),
                        twitter: str(row.twitter),
                        linkedin: str(row.linkedin),
                        youtube: str(row.youtube)
                    }
                };

                if (latitude !== null) data.latitude = latitude;
                if (longitude !== null) data.longitude = longitude;
                if (str(row.logo)) data.logo = str(row.logo);
                if (str(row.image)) data.image = str(row.image);
                else if (gallery.length) data.image = gallery[0].url;
                if (gallery.length) data.images = gallery;
                if (Object.keys(businessHours).length) data.businessHours = businessHours;

                const manualRank = parseNumber(row.manualRank);
                if (manualRank !== null) data.manualRank = manualRank;
                const responseTime = parseNumber(row.responseTime);
                if (responseTime !== null) data.responseTime = responseTime;
                const serviceRadius = parseNumber(row.serviceRadius);
                if (serviceRadius !== null) data.serviceRadius = serviceRadius;
                const employeeCount = parseNumber(row.employeeCount);
                if (employeeCount !== null) data.employeeCount = employeeCount;
                const yearEstablished = parseNumber(row.yearEstablished);
                if (yearEstablished !== null) {
                    const maxYear = new Date().getFullYear() + 1;
                    if (yearEstablished >= 1900 && yearEstablished <= maxYear) data.yearEstablished = yearEstablished;
                    else note(results.listings, rowNo, name,
                        `Year Established "${yearEstablished}" is outside 1900-${maxYear} - ignored.`, 'warning');
                }

                // Duplicate guard: same business name in the same city is treated as the same listing.
                const duplicate = await Company.findOne({
                    name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
                    ...(city ? { city_id: city._id } : {})
                });

                if (duplicate) {
                    if (!updateExisting) {
                        results.listings.skipped++;
                        note(results.listings, rowNo, name, 'A listing with this name already exists - skipped.', 'warning');
                        continue;
                    }
                    Object.assign(duplicate, data);
                    await duplicate.save();
                    results.listings.updated++;
                    continue;
                }

                await new Company(data).save();
                results.listings.created++;
            } catch (err) {
                results.listings.failed++;
                const reason = err.code === 11000
                    ? `Duplicate value for ${Object.keys(err.keyPattern || {}).join(', ') || 'a unique field'}`
                    : err.message;
                note(results.listings, rowNo, rowName, reason);
            }
        }

        const totals = ['categories', 'users', 'listings'].reduce((acc, key) => {
            acc.created += results[key].created;
            acc.updated += results[key].updated;
            acc.skipped += results[key].skipped;
            acc.failed += results[key].failed;
            return acc;
        }, { created: 0, updated: 0, skipped: 0, failed: 0 });

        await AdminAuditLog.create({
            adminId: req.user?._id,
            action: 'BULK_ACTION_EXECUTED',
            targetType: 'Listing',
            notes: `Spreadsheet import - categories: ${results.categories.created} new/${results.categories.updated} updated, `
                + `users: ${results.users.created} new/${results.users.updated} updated, `
                + `listings: ${results.listings.created} new/${results.listings.updated} updated, `
                + `${totals.failed} failed`,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent']
        });

        res.json({
            success: true,
            msg: `Import finished: ${totals.created} created, ${totals.updated} updated, ${totals.skipped} skipped, ${totals.failed} failed.`,
            totals,
            results,
            generatedCredentials
        });
    } catch (err) {
        console.error('Bulk Import Error:', err);
        res.status(500).json({ success: false, msg: 'Server error during import', error: err.message });
    }
};
