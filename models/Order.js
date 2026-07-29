const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
    productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true
    },
    serviceId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Service'
    },
    name: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true, min: 0 },
    discountPrice: { type: Number, min: 0 },
    total: { type: Number, required: true, min: 0 },
    variant: {
        color: String,
        size: String,
        sku: String
    },
    notes: String
});

const orderSchema = new mongoose.Schema({
    orderNumber: {
        type: String,
        required: true,
        unique: true
    },
    customerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    merchantId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company',
        required: true
    },
    items: [orderItemSchema],

    // Pricing
    subtotal: { type: Number, required: true, min: 0 },
    taxAmount: { type: Number, default: 0, min: 0 },
    discountAmount: { type: Number, default: 0, min: 0 },
    shippingAmount: { type: Number, default: 0, min: 0 },
    totalAmount: { type: Number, required: true, min: 0 },

    // Status
    status: {
        type: String,
        enum: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'],
        default: 'pending'
    },
    paymentStatus: {
        type: String,
        enum: ['pending', 'paid', 'failed', 'refunded'],
        default: 'pending'
    },

    // Shipping & Delivery
    shippingAddress: {
        street: String,
        city: String,
        state: String,
        zipCode: String,
        country: String
    },
    billingAddress: {
        street: String,
        city: String,
        state: String,
        zipCode: String,
        country: String
    },

    // Payment
    paymentMethod: {
        type: String,
        enum: ['card', 'upi', 'netbanking', 'cod', 'wallet'],
        required: true
    },
    paymentId: String,
    transactionId: String,

    // Timestamps
    orderDate: { type: Date, default: Date.now },
    confirmedAt: Date,
    shippedAt: Date,
    deliveredAt: Date,
    cancelledAt: Date,

    // Additional Info
    notes: String,
    trackingNumber: String,
    estimatedDelivery: Date,

    // Merchant actions
    merchantNotes: String,
    adminNotes: String,

    // Ratings & Reviews
    customerRating: { type: Number, min: 1, max: 5 },
    customerReview: String,
    merchantRating: { type: Number, min: 1, max: 5 },
    merchantReview: String,

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

// Indexes

orderSchema.index({ customerId: 1, createdAt: -1 });
orderSchema.index({ merchantId: 1, createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ paymentStatus: 1 });

// Pre-save hook to generate order number
orderSchema.pre('save', function(next) {
    if (this.isNew && !this.orderNumber) {
        const timestamp = Date.now().toString().slice(-6);
        const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
        this.orderNumber = `ORD-${timestamp}-${random}`;
    }
    next();
});

// Virtual for order age
orderSchema.virtual('orderAge').get(function() {
    return Math.floor((Date.now() - this.createdAt) / (1000 * 60 * 60 * 24)); // days
});

// Instance methods
orderSchema.methods.canCancel = function() {
    return ['pending', 'confirmed'].includes(this.status);
};

orderSchema.methods.canShip = function() {
    return this.status === 'processing' && this.paymentStatus === 'paid';
};

orderSchema.methods.canDeliver = function() {
    return this.status === 'shipped';
};

orderSchema.methods.calculateTotal = function() {
    this.subtotal = this.items.reduce((sum, item) => sum + item.total, 0);
    this.totalAmount = this.subtotal + this.taxAmount + this.shippingAmount - this.discountAmount;
    return this.totalAmount;
};

module.exports = mongoose.model('Order', orderSchema);