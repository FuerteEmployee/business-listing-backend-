const mongoose = require('mongoose');

const productVariantSchema = new mongoose.Schema({
    color: { type: String },
    size: { type: String },
    price: { type: Number, required: true },
    stock: { type: Number, required: true, default: 0 },
    sku: { type: String, required: true }
});

// Free-form spec parameters (Power, Capacity, Application, Frequency, Dimensions, ...).
// Manufacturer-defined: no fixed key list, nothing defaulted.
const productSpecificationSchema = new mongoose.Schema({
    key: { type: String, trim: true },
    value: { type: String, trim: true }
}, { _id: false });

const productSchema = new mongoose.Schema({
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    description: { type: String },
    shortDescription: { type: String },
    highlights: { type: String },
    specifications: [productSpecificationSchema],
    warranty: { type: String },
    
    // Core Architecture Tie-in
    listingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null },
    
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
    subCategoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
    brandId: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand' },
    
    sku: { type: String, required: true, unique: true },
    price: { type: Number, required: true, min: 0 },
    minPrice: { type: Number, min: 0 },
    maxPrice: { type: Number, min: 0 },
    priceType: { type: String, enum: ['fixed', 'range'], default: 'fixed' },
    discountPrice: { type: Number, min: 0 },
    displayOrder: { type: Number, default: 0 },
    taxClass: { type: String },
    
    stock: { type: Number, required: true, default: 0, min: 0 },
    minOrderQty: { type: Number, default: 1 },
    maxOrderQty: { type: Number },
    
    images: [{ type: String }], // Array of image URLs
    videoUrl: { type: String },
    
    variants: [productVariantSchema],
    
    status: { type: String, enum: ['Draft', 'Active', 'Archived'], default: 'Draft' },
    featured: { type: Boolean, default: false },
    sponsored: { type: Boolean, default: false },
    
    // SEO
    metaTitle: { type: String },
    metaDescription: { type: String },
    keywords: [{ type: String }],
    
    // Localization Support
    language: {
        en: { name: String, description: String },
        hi: { name: String, description: String },
        gu: { name: String, description: String }
    },
    
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    
}, { timestamps: true });

// Pre-save hook to ensure slug is set if missing
productSchema.pre('save', function(next) {
    if (this.name && !this.slug) {
        this.slug = this.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '') + '-' + Date.now();
    }
    next();
});

const Product = mongoose.model('Product', productSchema);

module.exports = Product;
