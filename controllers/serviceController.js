const Service = require('../models/Service');
const slugify = require('slugify');
const { isBrandScoped, ownsBrand } = require('../middleware/authMiddleware');

// Get all services
exports.getServices = async (req, res) => {
    try {
        const { listingId, categoryId, status, isFeatured, limit } = req.query;
        let query = {};

        if (listingId) query.listingId = listingId;
        if (categoryId) query.categoryId = categoryId;
        if (status) query.status = status;
        if (isFeatured === 'true') query.featured = true;

        // Scoping: an owner only ever sees services of the brands they own.
        // A requested listingId is honoured only when they own it, so filtering by
        // one of their own brands still works while other brands stay invisible.
        if (req.user && (isBrandScoped(req.user) || req.query.owned === 'true')) {
            query.listingId = ownsBrand(req, listingId)
                ? listingId
                : { $in: req.ownedBrandIds || [] };
        }

        let dbQuery = Service.find(query)
            .populate('listingId', 'name slug')
            .populate('categoryId', 'name')
            .sort({ displayOrder: 1, createdAt: -1 });

        if (limit) {
            dbQuery = dbQuery.limit(parseInt(limit));
        }

        const services = await dbQuery;

        res.status(200).json({
            success: true,
            count: services.length,
            data: services
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// Bulk reorder services
exports.reorderServices = async (req, res) => {
    try {
        const { orders } = req.body; // Array of { id, displayOrder }
        
        const bulkOps = orders.map(item => ({
            updateOne: {
                filter: { _id: item.id },
                update: { displayOrder: item.displayOrder }
            }
        }));

        await Service.bulkWrite(bulkOps);

        res.status(200).json({ success: true, msg: 'Reordered successfully' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// Get single service
exports.getService = async (req, res) => {
    try {
        const service = await Service.findById(req.params.id)
            .populate('listingId', 'name slug')
            .populate('categoryId', 'name')
            .populate('subCategoryId', 'name');

        if (!service) {
            return res.status(404).json({ success: false, error: 'Service not found' });
        }

        // Multi-tenancy isolation: block access for tenants if the service belongs to another company.
        if (isBrandScoped(req.user)) {
            const listingId = service.listingId?._id || service.listingId;
            if (!ownsBrand(req, listingId)) {
                return res.status(403).json({ success: false, error: 'Access Denied: You do not own this service' });
            }
        }

        res.status(200).json({ success: true, data: service });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// Create new service
exports.createService = async (req, res) => {
    try {
        req.body.createdBy = req.user.id;
        
        if (req.body.subCategoryId === '') delete req.body.subCategoryId;
        
        // Auto-generate slug if not provided
        if (req.body.name && !req.body.slug) {
            req.body.slug = slugify(req.body.name, { lower: true, strict: true });
        }
        
        // Validation for brand owners: the service must belong to one of their brands
        if (isBrandScoped(req.user) && !ownsBrand(req, req.body.listingId)) {
            return res.status(403).json({ success: false, error: 'Not authorized to add service to this brand' });
        }

        const service = await Service.create(req.body);

        res.status(201).json({
            success: true,
            data: service
        });
    } catch (error) {
        if (error.code === 11000) {
            const field = Object.keys(error.keyValue)[0];
            return res.status(400).json({ success: false, error: `Duplicate error: ${field} already exists.` });
        }
        res.status(400).json({ success: false, error: error.message });
    }
};

// Update service
exports.updateService = async (req, res) => {
    try {
        req.body.updatedBy = req.user.id;

        if (req.body.subCategoryId === '') req.body.subCategoryId = null;

        // Auto-generate slug if name is updated but slug isn't provided
        if (req.body.name && !req.body.slug) {
            req.body.slug = slugify(req.body.name, { lower: true, strict: true });
        }

        let service = await Service.findById(req.params.id);
        if (!service) {
            return res.status(404).json({ success: false, error: 'Service not found' });
        }

        // Authorization check for brand owners
        if (isBrandScoped(req.user)) {
            if (!ownsBrand(req, service.listingId)) {
                return res.status(403).json({ success: false, error: 'Not authorized to update this service' });
            }
            // Also prevent changing listingId to a brand they don't own
            if (req.body.listingId && !ownsBrand(req, req.body.listingId)) {
                return res.status(403).json({ success: false, error: 'Not authorized to move service to this brand' });
            }
        }

        service = await Service.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true
        });

        res.status(200).json({ success: true, data: service });
    } catch (error) {
         if (error.code === 11000) {
            const field = Object.keys(error.keyValue)[0];
            return res.status(400).json({ success: false, error: `Duplicate error: ${field} already exists.` });
        }
        res.status(400).json({ success: false, error: error.message });
    }
};

// Delete service
exports.deleteService = async (req, res) => {
    try {
        let service = await Service.findById(req.params.id);
        if (!service) {
            return res.status(404).json({ success: false, error: 'Service not found' });
        }

        // Authorization check for brand owners
        if (isBrandScoped(req.user) && !ownsBrand(req, service.listingId)) {
            return res.status(403).json({ success: false, error: 'Not authorized to delete this service' });
        }

        await Service.findByIdAndDelete(req.params.id);

        res.status(200).json({ success: true, data: {} });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};
