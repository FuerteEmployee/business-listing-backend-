const mongoose = require('mongoose');
const Product = require('../models/Product');
const Service = require('../models/Service');
const Order = require('../models/Order');
const Company = require('../models/Company');
const User = require('../models/User');
const Category = require('../models/Category');

// ==================== DASHBOARD OVERVIEW ====================

// Get merchant dashboard overview
const getMerchantDashboard = async (req, res) => {
    try {
        let merchantId = req.query.listingId || req.query.merchantId || req.user.merchantId || req.params.merchantId;

        // Validation for multi-company merchants
        if (req.user.role !== 'Super Admin' && req.ownedBrandIds) {
            const ownedIds = req.ownedBrandIds.map(id => id.toString());
            if (merchantId && !ownedIds.includes(merchantId)) {
                return res.status(403).json({ success: false, msg: 'Not authorized to view this brand data' });
            }
            // If no merchantId provided, default to the first owned brand
            if (!merchantId && ownedIds.length > 0) {
                merchantId = ownedIds[0];
            }
        }

        if (!merchantId) {
            return res.status(400).json({ success: false, msg: 'Merchant ID required' });
        }

        // Get merchant info
        const merchant = await Company.findById(merchantId);
        if (!merchant) {
            return res.status(404).json({ success: false, msg: 'Merchant not found' });
        }

        // Get current month stats
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const [
            totalProducts,
            activeProducts,
            totalServices,
            activeServices,
            totalOrders,
            pendingOrders,
            completedOrders,
            totalRevenue
        ] = await Promise.all([
            Product.countDocuments({ listingId: merchantId }),
            Product.countDocuments({ listingId: merchantId, status: 'Active' }),
            Service.countDocuments({ listingId: merchantId }),
            Service.countDocuments({ listingId: merchantId, status: 'Active' }),
            Order.countDocuments({ merchantId }),
            Order.countDocuments({ merchantId, status: { $in: ['pending', 'confirmed'] } }),
            Order.countDocuments({ merchantId, status: 'delivered' }),
            Order.aggregate([
                { $match: { merchantId: mongoose.Types.ObjectId(merchantId), status: 'delivered' } },
                { $group: { _id: null, total: { $sum: '$totalAmount' } } }
            ])
        ]);

        // Get recent orders
        const recentOrders = await Order.find({ merchantId })
            .populate('customerId', 'name email')
            .sort({ createdAt: -1 })
            .limit(5)
            .select('orderNumber totalAmount status createdAt customerId');

        // Get low stock products
        const lowStockProducts = await Product.find({
            listingId: merchantId,
            status: 'Active',
            stock: { $lt: 10, $gt: 0 }
        })
        .select('name stock sku')
        .limit(5);

        // Get monthly revenue trend (last 6 months)
        const revenueTrend = await Order.aggregate([
            {
                $match: {
                    merchantId: mongoose.Types.ObjectId(merchantId),
                    status: 'delivered',
                    createdAt: { $gte: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000) }
                }
            },
            {
                $group: {
                    _id: {
                        $dateToString: { format: '%Y-%m', date: '$createdAt' }
                    },
                    revenue: { $sum: '$totalAmount' },
                    orders: { $sum: 1 }
                }
            },
            { $sort: { '_id': 1 } }
        ]);

        res.json({
            success: true,
            merchant: {
                id: merchant._id,
                name: merchant.name,
                status: merchant.status
            },
            stats: {
                products: {
                    total: totalProducts,
                    active: activeProducts
                },
                services: {
                    total: totalServices,
                    active: activeServices
                },
                orders: {
                    total: totalOrders,
                    pending: pendingOrders,
                    completed: completedOrders
                },
                revenue: totalRevenue[0]?.total || 0
            },
            recentOrders,
            lowStockProducts,
            revenueTrend
        });
    } catch (err) {
        console.error('Error fetching merchant dashboard:', err);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// ==================== PRODUCT MANAGEMENT ====================

// Get merchant's products
const getMerchantProducts = async (req, res) => {
    try {
        let merchantId = req.query.listingId || req.query.merchantId || req.user.merchantId || req.params.merchantId;
        
        // Validation
        if (req.user.role !== 'Super Admin' && req.ownedBrandIds) {
            const ownedIds = req.ownedBrandIds.map(id => id.toString());
            if (merchantId && !ownedIds.includes(merchantId)) {
                return res.status(403).json({ success: false, msg: 'Not authorized' });
            }
            if (!merchantId) merchantId = ownedIds[0];
        }

        const { status, category, search, page = 1, limit = 20 } = req.query;

        let query = { listingId: merchantId };

        if (status) query.status = status;
        if (category) query.categoryId = category;
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } },
                { sku: { $regex: search, $options: 'i' } }
            ];
        }

        const products = await Product.find(query)
            .populate('categoryId', 'name')
            .populate('subCategoryId', 'name')
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .select('name sku price stock status featured images createdAt categoryId');

        const total = await Product.countDocuments(query);

        res.json({
            success: true,
            products,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (err) {
        console.error('Error fetching merchant products:', err);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// Create new product
const createMerchantProduct = async (req, res) => {
    try {
        const merchantId = req.user.merchantId || req.params.merchantId;

        const productData = {
            ...req.body,
            listingId: merchantId,
            createdBy: req.user._id,
            status: 'Draft' // New products start as draft
        };

        const product = new Product(productData);
        await product.save();

        await product.populate('categoryId', 'name');

        res.status(201).json({
            success: true,
            product,
            msg: 'Product created successfully. Submit for approval to make it live.'
        });
    } catch (err) {
        console.error('Error creating product:', err);
        if (err.code === 11000) {
            res.status(400).json({ success: false, msg: 'SKU or slug already exists' });
        } else {
            res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
        }
    }
};

// Update product
const updateMerchantProduct = async (req, res) => {
    try {
        const { productId } = req.params;
        const merchantId = req.user.merchantId || req.params.merchantId;

        const product = await Product.findOne({
            _id: productId,
            listingId: merchantId
        });

        if (!product) {
            return res.status(404).json({ success: false, msg: 'Product not found' });
        }

        // If product is active, changing certain fields requires re-approval
        const sensitiveFields = ['name', 'price', 'images', 'description'];
        const hasSensitiveChanges = sensitiveFields.some(field =>
            req.body[field] !== undefined && req.body[field] !== product[field]
        );

        if (product.status === 'Active' && hasSensitiveChanges) {
            req.body.status = 'Draft'; // Requires re-approval
        }

        Object.assign(product, req.body);
        product.updatedBy = req.user._id;
        await product.save();

        await product.populate('categoryId', 'name');

        res.json({
            success: true,
            product,
            msg: hasSensitiveChanges && product.status === 'Active' ?
                'Product updated. Changes require admin approval.' :
                'Product updated successfully'
        });
    } catch (err) {
        console.error('Error updating product:', err);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// Delete product
const deleteMerchantProduct = async (req, res) => {
    try {
        const { productId } = req.params;
        const merchantId = req.user.merchantId || req.params.merchantId;

        const product = await Product.findOne({
            _id: productId,
            listingId: merchantId
        });

        if (!product) {
            return res.status(404).json({ success: false, msg: 'Product not found' });
        }

        // Check if product has active orders
        const activeOrders = await Order.countDocuments({
            'items.productId': productId,
            status: { $nin: ['cancelled', 'refunded'] }
        });

        if (activeOrders > 0) {
            return res.status(400).json({
                success: false,
                msg: 'Cannot delete product with active orders. Archive instead.'
            });
        }

        await Product.findByIdAndDelete(productId);

        res.json({ success: true, msg: 'Product deleted successfully' });
    } catch (err) {
        console.error('Error deleting product:', err);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// Submit product for approval
const submitProductForApproval = async (req, res) => {
    try {
        const { productId } = req.params;
        const merchantId = req.user.merchantId || req.params.merchantId;

        const product = await Product.findOne({
            _id: productId,
            listingId: merchantId
        });

        if (!product) {
            return res.status(404).json({ success: false, msg: 'Product not found' });
        }

        if (product.status !== 'Draft') {
            return res.status(400).json({ success: false, msg: 'Only draft products can be submitted for approval' });
        }

        // Here you could create an approval request or notification
        // For now, we'll just update the status to pending approval

        product.status = 'Pending Approval';
        await product.save();

        res.json({
            success: true,
            msg: 'Product submitted for admin approval'
        });
    } catch (err) {
        console.error('Error submitting product for approval:', err);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// ==================== SERVICE MANAGEMENT ====================

// Get merchant's services
const getMerchantServices = async (req, res) => {
    try {
        let merchantId = req.query.listingId || req.query.merchantId || req.user.merchantId || req.params.merchantId;

        // Validation
        if (req.user.role !== 'Super Admin' && req.ownedBrandIds) {
            const ownedIds = req.ownedBrandIds.map(id => id.toString());
            if (merchantId && !ownedIds.includes(merchantId)) {
                return res.status(403).json({ success: false, msg: 'Not authorized' });
            }
            if (!merchantId) merchantId = ownedIds[0];
        }

        const { status, category, search, page = 1, limit = 20 } = req.query;

        let query = { listingId: merchantId };

        if (status) query.status = status;
        if (category) query.categoryId = category;
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } }
            ];
        }

        const services = await Service.find(query)
            .populate('categoryId', 'name')
            .populate('subCategoryId', 'name')
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .select('name price priceType status featured images createdAt categoryId');

        const total = await Service.countDocuments(query);

        res.json({
            success: true,
            services,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (err) {
        console.error('Error fetching merchant services:', err);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// Create new service
const createMerchantService = async (req, res) => {
    try {
        const merchantId = req.user.merchantId || req.params.merchantId;

        const serviceData = {
            ...req.body,
            listingId: merchantId,
            createdBy: req.user._id,
            status: 'Draft'
        };

        const service = new Service(serviceData);
        await service.save();

        await service.populate('categoryId', 'name');

        res.status(201).json({
            success: true,
            service,
            msg: 'Service created successfully. Submit for approval to make it live.'
        });
    } catch (err) {
        console.error('Error creating service:', err);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// Update service
const updateMerchantService = async (req, res) => {
    try {
        const { serviceId } = req.params;
        const merchantId = req.user.merchantId || req.params.merchantId;

        const service = await Service.findOne({
            _id: serviceId,
            listingId: merchantId
        });

        if (!service) {
            return res.status(404).json({ success: false, msg: 'Service not found' });
        }

        Object.assign(service, req.body);
        service.updatedBy = req.user._id;
        await service.save();

        await service.populate('categoryId', 'name');

        res.json({ success: true, service, msg: 'Service updated successfully' });
    } catch (err) {
        console.error('Error updating service:', err);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// ==================== ORDER MANAGEMENT ====================

// Get merchant's orders
const getMerchantOrders = async (req, res) => {
    try {
        let merchantId = req.query.listingId || req.query.merchantId || req.user.merchantId || req.params.merchantId;

        // Validation
        if (req.user.role !== 'Super Admin' && req.ownedBrandIds) {
            const ownedIds = req.ownedBrandIds.map(id => id.toString());
            if (merchantId && !ownedIds.includes(merchantId)) {
                return res.status(403).json({ success: false, msg: 'Not authorized' });
            }
            if (!merchantId) merchantId = ownedIds[0];
        }

        const { status, paymentStatus, search, page = 1, limit = 20 } = req.query;

        let query = { merchantId };

        if (status) query.status = status;
        if (paymentStatus) query.paymentStatus = paymentStatus;
        if (search) {
            query.$or = [
                { orderNumber: { $regex: search, $options: 'i' } }
            ];
        }

        const orders = await Order.find(query)
            .populate('customerId', 'name email')
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .select('orderNumber totalAmount status paymentStatus createdAt customerId items');

        const total = await Order.countDocuments(query);

        res.json({
            success: true,
            orders,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (err) {
        console.error('Error fetching merchant orders:', err);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// Get order details
const getMerchantOrderDetails = async (req, res) => {
    try {
        const { orderId } = req.params;
        const merchantId = req.user.merchantId || req.params.merchantId;

        const order = await Order.findOne({
            _id: orderId,
            merchantId
        })
        .populate('customerId', 'name email phone')
        .populate('items.productId', 'name sku images')
        .populate('items.serviceId', 'name');

        if (!order) {
            return res.status(404).json({ success: false, msg: 'Order not found' });
        }

        res.json({ success: true, order });
    } catch (err) {
        console.error('Error fetching order details:', err);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// Update order status
const updateOrderStatus = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { status, trackingNumber, notes } = req.body;
        const merchantId = req.user.merchantId || req.params.merchantId;

        const order = await Order.findOne({
            _id: orderId,
            merchantId
        });

        if (!order) {
            return res.status(404).json({ success: false, msg: 'Order not found' });
        }

        // Validate status transition
        const validTransitions = {
            pending: ['confirmed', 'cancelled'],
            confirmed: ['processing', 'cancelled'],
            processing: ['shipped', 'cancelled'],
            shipped: ['delivered', 'cancelled']
        };

        if (!validTransitions[order.status]?.includes(status)) {
            return res.status(400).json({
                success: false,
                msg: `Cannot change status from ${order.status} to ${status}`
            });
        }

        order.status = status;
        if (trackingNumber) order.trackingNumber = trackingNumber;
        if (notes) order.merchantNotes = notes;

        // Set timestamps based on status
        const now = new Date();
        switch (status) {
            case 'confirmed':
                order.confirmedAt = now;
                break;
            case 'shipped':
                order.shippedAt = now;
                break;
            case 'delivered':
                order.deliveredAt = now;
                break;
            case 'cancelled':
                order.cancelledAt = now;
                break;
        }

        await order.save();

        res.json({
            success: true,
            order,
            msg: `Order status updated to ${status}`
        });
    } catch (err) {
        console.error('Error updating order status:', err);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// ==================== INVENTORY MANAGEMENT ====================

// Get low stock alerts
const getLowStockAlerts = async (req, res) => {
    try {
        let merchantId = req.query.listingId || req.query.merchantId || req.user.merchantId || req.params.merchantId;

        // Validation
        if (req.user.role !== 'Super Admin' && req.ownedBrandIds) {
            const ownedIds = req.ownedBrandIds.map(id => id.toString());
            if (merchantId && !ownedIds.includes(merchantId)) {
                return res.status(403).json({ success: false, msg: 'Not authorized' });
            }
            if (!merchantId) merchantId = ownedIds[0];
        }

        const threshold = req.query.threshold || 10;

        const lowStockProducts = await Product.find({
            listingId: merchantId,
            status: 'Active',
            stock: { $lt: threshold, $gt: 0 }
        })
        .populate('categoryId', 'name')
        .select('name sku stock price images categoryId')
        .sort({ stock: 1 });

        const outOfStockProducts = await Product.find({
            listingId: merchantId,
            status: 'Active',
            stock: 0
        })
        .populate('categoryId', 'name')
        .select('name sku stock price images categoryId')
        .sort({ createdAt: -1 });

        res.json({
            success: true,
            alerts: {
                lowStock: lowStockProducts,
                outOfStock: outOfStockProducts
            }
        });
    } catch (err) {
        console.error('Error fetching stock alerts:', err);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// Update product stock
const updateProductStock = async (req, res) => {
    try {
        const { productId } = req.params;
        const { stock, operation = 'set' } = req.body; // operation: 'set', 'add', 'subtract'
        const merchantId = req.user.merchantId || req.params.merchantId;

        const product = await Product.findOne({
            _id: productId,
            listingId: merchantId
        });

        if (!product) {
            return res.status(404).json({ success: false, msg: 'Product not found' });
        }

        let newStock;
        switch (operation) {
            case 'add':
                newStock = product.stock + parseInt(stock);
                break;
            case 'subtract':
                newStock = Math.max(0, product.stock - parseInt(stock));
                break;
            default:
                newStock = parseInt(stock);
        }

        product.stock = newStock;
        await product.save();

        res.json({
            success: true,
            product: { _id: product._id, name: product.name, stock: product.stock },
            msg: `Stock updated to ${newStock}`
        });
    } catch (err) {
        console.error('Error updating product stock:', err);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

// ==================== ANALYTICS ====================

// Get merchant analytics
const getMerchantAnalytics = async (req, res) => {
    try {
        let merchantId = req.query.listingId || req.query.merchantId || req.user.merchantId || req.params.merchantId;

        // Validation
        if (req.user.role !== 'Super Admin' && req.ownedBrandIds) {
            const ownedIds = req.ownedBrandIds.map(id => id.toString());
            if (merchantId && !ownedIds.includes(merchantId)) {
                return res.status(403).json({ success: false, msg: 'Not authorized' });
            }
            if (!merchantId) merchantId = ownedIds[0];
        }

        const { range = '30d' } = req.query;

        // Calculate date range
        const now = new Date();
        let startDate;

        switch (range) {
            case '7d':
                startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                break;
            case '30d':
                startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                break;
            case '90d':
                startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
                break;
            case '1y':
                startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
                break;
            default:
                startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        }

        // Get basic stats
        const [
            totalRevenue,
            totalOrders,
            totalCustomers,
            averageRating
        ] = await Promise.all([
            Order.aggregate([
                {
                    $match: {
                        merchantId: mongoose.Types.ObjectId(merchantId),
                        status: 'delivered',
                        createdAt: { $gte: startDate }
                    }
                },
                { $group: { _id: null, total: { $sum: '$totalAmount' } } }
            ]),
            Order.countDocuments({
                merchantId,
                createdAt: { $gte: startDate }
            }),
            Order.distinct('customerId', {
                merchantId,
                createdAt: { $gte: startDate }
            }).then(customers => customers.length),
            // For now, return a placeholder rating
            Promise.resolve(4.2)
        ]);

        // Get order status breakdown
        const orderStatusBreakdown = await Order.aggregate([
            {
                $match: {
                    merchantId: mongoose.Types.ObjectId(merchantId),
                    createdAt: { $gte: startDate }
                }
            },
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 }
                }
            }
        ]);

        const statusBreakdown = {};
        orderStatusBreakdown.forEach(item => {
            statusBreakdown[item._id] = item.count;
        });

        // Get top products
        const topProducts = await Order.aggregate([
            {
                $match: {
                    merchantId: mongoose.Types.ObjectId(merchantId),
                    status: 'delivered',
                    createdAt: { $gte: startDate }
                }
            },
            { $unwind: '$items' },
            {
                $group: {
                    _id: '$items.productId',
                    revenue: { $sum: '$items.total' },
                    sales: { $sum: '$items.quantity' }
                }
            },
            { $sort: { revenue: -1 } },
            { $limit: 5 }
        ]);

        // Populate product names
        await Product.populate(topProducts, {
            path: '_id',
            select: 'name'
        });

        const formattedTopProducts = topProducts.map(item => ({
            _id: item._id._id,
            name: item._id.name,
            revenue: item.revenue,
            sales: item.sales
        }));

        // Get customer insights
        const customerData = await Order.aggregate([
            {
                $match: {
                    merchantId: mongoose.Types.ObjectId(merchantId),
                    createdAt: { $gte: startDate }
                }
            },
            {
                $group: {
                    _id: '$customerId',
                    orderCount: { $sum: 1 },
                    totalSpent: { $sum: '$totalAmount' },
                    lastOrder: { $max: '$createdAt' }
                }
            }
        ]);

        const newCustomers = customerData.filter(c =>
            new Date(c.lastOrder) >= new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        ).length;

        const returningCustomers = customerData.filter(c => c.orderCount > 1).length;

        const averageOrderValue = totalRevenue[0]?.total ?
            totalRevenue[0].total / totalOrders : 0;

        res.json({
            success: true,
            totalRevenue: totalRevenue[0]?.total || 0,
            totalOrders,
            totalCustomers,
            averageRating,
            orderStatusBreakdown: statusBreakdown,
            topProducts: formattedTopProducts,
            newCustomers,
            returningCustomers,
            averageOrderValue,
            insights: [
                'Your top-selling product is performing well - consider creating similar items',
                'Customer retention is strong with ' + returningCustomers + ' repeat customers',
                'Average order value of ₹' + Math.round(averageOrderValue) + ' indicates good pricing strategy',
                'Focus on converting pending orders to increase revenue'
            ]
        });
    } catch (err) {
        console.error('Error fetching merchant analytics:', err);
        res.status(500).json({ success: false, msg: 'Server Error', error: err.message });
    }
};

module.exports = {
    getMerchantDashboard,
    getMerchantProducts,
    createMerchantProduct,
    updateMerchantProduct,
    deleteMerchantProduct,
    submitProductForApproval,
    getMerchantServices,
    createMerchantService,
    updateMerchantService,
    getMerchantOrders,
    getMerchantOrderDetails,
    updateOrderStatus,
    getLowStockAlerts,
    updateProductStock,
    getMerchantAnalytics
};