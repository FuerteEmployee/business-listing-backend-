const mongoose = require('mongoose');
const Company = require('../models/Company');
const User = require('../models/User');
const Category = require('../models/Category');
const Country = require('../models/Country');
const State = require('../models/State');
const City = require('../models/City');
const Area = require('../models/Area');
const slugify = require('slugify');
const { isBrandScoped } = require('../middleware/authMiddleware');
const { resolveManualLocation } = require('../utils/resolveManualLocation');

// Helper to create a basic fuzzy regex (e.g. "pilo" -> "p.*i.*l.*o")
const createFuzzyRegex = (str) => {
    if (!str) return '';
    // Escape special regex characters first to prevent regex injection
    const escaped = str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return escaped.split('').join('.*');
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
        
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const parsedLimit = parseInt(limit);
        
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
        if (categoryId && isValidObjectId(categoryId)) matchQuery.category_id = new mongoose.Types.ObjectId(categoryId);
        if (isFeatured !== undefined || featured !== undefined) {
            matchQuery.isFeatured = (isFeatured === 'true' || featured === 'true');
        }
        if (priceRange) matchQuery.priceRange = priceRange;
        if (rating) matchQuery.rating = { $gte: parseFloat(rating) };

        // 2. Search Query (Text search with fuzzy matching)
        if (q) {
            const fuzzyPattern = createFuzzyRegex(q);
            const regexQuery = { $regex: fuzzyPattern, $options: 'i' };
            
            matchQuery.$or = [
                { name: regexQuery },
                { description: regexQuery },
                { tags: regexQuery } // assuming tags are strings
            ];
        }

        let pipeline = [];

        // 3. Geospatial Sort (must be first stage)
        if (sort === 'distance' && lat && lng) {
            pipeline.push({
                $geoNear: {
                    near: { type: "Point", coordinates: [parseFloat(lng), parseFloat(lat)] },
                    distanceField: "distance",
                    spherical: true,
                    query: matchQuery
                }
            });
        } else {
            pipeline.push({ $match: matchQuery });
            
            // Initial Sort if not distance
            if (sort === 'latest') pipeline.push({ $sort: { createdAt: -1 } });
            else if (sort === 'rating') pipeline.push({ $sort: { rating: -1 } });
            else if (sort === 'reviews') pipeline.push({ $sort: { reviewCount: -1 } });
            else {
                // Default Ranking (Premium First, then manualRank, then rating)
                pipeline.push({ $sort: { isFeatured: -1, manualRank: -1, rating: -1 } });
            }
        }

        // 4. Pagination & Count
        const countPipeline = [...pipeline, { $count: "total" }];
        const countResult = await Company.aggregate(countPipeline);
        let total = countResult.length > 0 ? countResult[0].total : 0;

        // Fallback: If 0 results matching selected city, try searching without the city filter
        if (total === 0 && matchQuery.city_id) {
            const fallbackMatchQuery = { ...matchQuery };
            delete fallbackMatchQuery.city_id;

            let fallbackPipeline = [];
            if (sort === 'distance' && lat && lng) {
                fallbackPipeline.push({
                    $geoNear: {
                        near: { type: "Point", coordinates: [parseFloat(lng), parseFloat(lat)] },
                        distanceField: "distance",
                        spherical: true,
                        query: fallbackMatchQuery
                    }
                });
            } else {
                fallbackPipeline.push({ $match: fallbackMatchQuery });
                if (sort === 'latest') fallbackPipeline.push({ $sort: { createdAt: -1 } });
                else if (sort === 'rating') fallbackPipeline.push({ $sort: { rating: -1 } });
                else if (sort === 'reviews') fallbackPipeline.push({ $sort: { reviewCount: -1 } });
                else {
                    fallbackPipeline.push({ $sort: { isFeatured: -1, manualRank: -1, rating: -1 } });
                }
            }

            const fallbackCountPipeline = [...fallbackPipeline, { $count: "total" }];
            const fallbackCountResult = await Company.aggregate(fallbackCountPipeline);
            const fallbackTotal = fallbackCountResult.length > 0 ? fallbackCountResult[0].total : 0;

            if (fallbackTotal > 0) {
                pipeline = fallbackPipeline;
                total = fallbackTotal;
            }
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
            Product.find({ listingId: { $in: companyIds } }).lean(),
            Service.find({ listingId: { $in: companyIds } }).lean()
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

            return {
                ...company,
                image: coverUrl,
                photos: photoUrls,
                products: productsByCompany[company._id.toString()] || [],
                services: servicesByCompany[company._id.toString()] || []
            };
        });

        res.json({
            data: companies,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (err) {
        console.error('GetAllCompanies Error:', err.message);
        res.status(500).json({ msg: 'Server Error', error: err.message });
    }
};

// @desc    Create a new company
// @route   POST /api/companies
const createCompany = async (req, res) => {
    try {
        const body = { ...req.body };

        // Convert latitude/longitude to GeoJSON if provided
        if (body.latitude && body.longitude) {
            body.location = {
                type: 'Point',
                coordinates: [parseFloat(body.longitude), parseFloat(body.latitude)]
            };
        }

        // Sanitise sentinel values and resolve manual location entries
        await resolveManualLocation(body);


        // For logged-in users, assign them as owner and ensure they are at least a Brand Owner
        if (req.user) {
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
        // Sanitize fields
        ['country_id', 'state_id', 'city_id', 'area_id', 'category_id', 'owner', 'latitude', 'longitude', 'gstPan', 'subCategory', 'manualCountry', 'manualState', 'manualCity', 'manualArea'].forEach(field => {
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
        const trackFields = ['name', 'status', 'verified', 'verificationStatus', 'owner', 'manualRank', 'category_id', 'gstPan', 'tagline', 'serviceRadius', 'logo', 'images', 'videos'];
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

        // Use fuzzy matching for better typo tolerance
        const fuzzyPattern = createFuzzyRegex(q);
        const regex = new RegExp(fuzzyPattern, 'i');
        
        // Parallel search for Categories and Companies (include slug)
        const [categories, companyNames] = await Promise.all([
            Category.find({ name: regex }).limit(5).select('name slug -_id').lean(),
            Company.find({ name: regex }).limit(5).select('name slug -_id').lean()
        ]);

        // Flatten and merge results
        const results = [
            ...categories.map(c => ({ text: c.name, slug: c.slug, type: 'Category' })),
            ...companyNames.map(c => ({ text: c.name, slug: c.slug, type: 'Business' }))
        ];

        res.json(results);
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

// @desc    Get all questions for merchant's businesses
// @route   GET /api/companies/questions/merchant
// @access  Private (Merchant)
const getMerchantQuestions = async (req, res) => {
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

module.exports = { 
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
    getMerchantQuestions,
    answerQuestion,
    getAdminQuestions,
    deleteQuestion
};
