const mongoose = require('mongoose');

const serviceSchema = new mongoose.Schema({
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    description: { type: String },
    shortDescription: { type: String },
    
    // Core Architecture Tie-in
    listingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
    
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
    subCategoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
    
    providerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Optional explicit provider mapping
    
    priceType: { type: String, enum: ['fixed', 'hourly', 'range'], required: true, default: 'fixed' },
    price: { type: Number },
    minPrice: { type: Number }, // Support for price range
    maxPrice: { type: Number }, // Support for price range
    hourlyRate: { type: Number },
    discountPrice: { type: Number },
    
    displayOrder: { type: Number, default: 0 }, // For drag-and-drop reordering
    
    // Booking Settings
    duration: { type: Number }, // in minutes
    slotDuration: { type: Number }, // in minutes
    maxBookingsPerSlot: { type: Number, default: 1 },
    
    serviceArea: {
        country: { type: String },
        state: { type: String },
        city: { type: String },
        radius: { type: Number } // in kilometers
    },
    
    availability: {
        days: [{ type: String, enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] }],
        startTime: { type: String }, // Format: "09:00"
        endTime: { type: String },   // Format: "18:00"
        holidayExceptions: [{ type: Date }]
    },
    
    images: [{ type: String }],
    videoUrl: { type: String },
    
    status: { type: String, enum: ['Draft', 'Active', 'Archived'], default: 'Draft' },
    featured: { type: Boolean, default: false },
    sponsored: { type: Boolean, default: false },
    
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    
}, { timestamps: true });

// Pre-save hook to ensure slug is set if missing
serviceSchema.pre('save', function(next) {
    if (this.name && !this.slug) {
        this.slug = this.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '') + '-' + Date.now();
    }
    next();
});

const Service = mongoose.model('Service', serviceSchema);

module.exports = Service;
