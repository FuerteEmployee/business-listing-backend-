const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Company = require('./models/Company');
const Category = require('./models/Category');
const Product = require('./models/Product');
const Service = require('./models/Service');

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/justdial';

const sampleProducts = [
    {
        name: "Samsung Galaxy S24 Ultra",
        description: "The latest flagship from Samsung with AI capabilities and a titanium frame.",
        shortDescription: "Premium Android Smartphone",
        price: 1299,
        discountPrice: 1199,
        stock: 50,
        status: "Active",
        images: ["https://images.unsplash.com/photo-1610945415295-d9bbf067e59c?q=80&w=600&auto=format&fit=crop"]
    },
    {
        name: "Apple MacBook Pro M3 Max",
        description: "Incredibly powerful laptop for professionals. Features the M3 Max chip with a 16-core CPU.",
        shortDescription: "Professional 16-inch Laptop",
        price: 3499,
        stock: 20,
        status: "Active",
        images: ["https://images.unsplash.com/photo-1517336714731-489689fd1ca8?q=80&w=600&auto=format&fit=crop"]
    },
    {
        name: "Sony WH-1000XM5",
        description: "Industry-leading noise canceling headphones with exceptional sound quality.",
        shortDescription: "Wireless Noise Canceling Headphones",
        price: 398,
        discountPrice: 348,
        stock: 100,
        status: "Active",
        images: ["https://images.unsplash.com/photo-1618366712010-f4ae9c647dcb?q=80&w=600&auto=format&fit=crop"]
    }
];

const sampleServices = [
    {
        name: "Deep Home Cleaning",
        description: "Comprehensive home cleaning service including all rooms, bathrooms, and kitchen deep clean.",
        shortDescription: "Professional Deep Cleaning",
        priceType: "fixed",
        price: 150,
        duration: 240,
        status: "Active",
        serviceArea: { city: "New York", radius: 50 },
        images: ["https://images.unsplash.com/photo-1581578731548-c64695cc6952?q=80&w=600&auto=format&fit=crop"]
    },
    {
        name: "Emergency Plumbing Repair",
        description: "24/7 emergency response for leaks, bursts, and blockages.",
        shortDescription: "Fast Plumbing Service",
        priceType: "hourly",
        hourlyRate: 85,
        duration: 60,
        status: "Active",
        serviceArea: { city: "New York", radius: 30 },
        images: ["https://images.unsplash.com/photo-1607472586893-edb57cbceb42?q=80&w=600&auto=format&fit=crop"]
    },
    {
        name: "AC Installation & Service",
        description: "Professional installation and servicing of split and window AC units.",
        shortDescription: "HVAC Experts",
        priceType: "range",
        price: 99,
        status: "Active",
        serviceArea: { city: "New York", radius: 40 },
        images: ["https://images.unsplash.com/photo-1599839619722-39751411ea63?q=80&w=600&auto=format&fit=crop"]
    }
];

const seedProductsAndServices = async () => {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('✅ Connected to DB');

        // Clear existing test data
        await Product.deleteMany({});
        await Service.deleteMany({});
        console.log('🗑️  Cleared existing products and services');

        // Fetch parent references
        const companies = await Company.find().limit(3);
        const categories = await Category.find({ parentId: null }).limit(5);

        if (companies.length === 0 || categories.length === 0) {
            console.error('❌ Error: Need at least 1 company and 1 category in the database to seed.');
            process.exit(1);
        }

        const electronicsCategory = categories.find(c => c.name.toLowerCase().includes('electronic')) || categories[0];
        const servicesCategory = categories.find(c => c.name.toLowerCase().includes('service') || c.name.toLowerCase().includes('repair')) || categories[1] || categories[0];


        // Seed Products
        console.log('Seeding products...');
        for (let i = 0; i < sampleProducts.length; i++) {
            const product = new Product({
                ...sampleProducts[i],
                slug: `product-${Date.now()}-${i}`,
                sku: `SKU-${Date.now()}-${i}`,
                listingId: companies[i % companies.length]._id,
                categoryId: electronicsCategory._id
            });
            await product.save();
        }

        // Seed Services
        console.log('Seeding services...');
        for (let i = 0; i < sampleServices.length; i++) {
            const service = new Service({
                ...sampleServices[i],
                slug: `service-${Date.now()}-${i}`,
                listingId: companies[i % companies.length]._id,
                categoryId: servicesCategory._id
            });
            await service.save();
        }

        console.log('🎉 Successfully seeded products and services!');
        
    } catch (error) {
        console.error('❌ Error seeding data:', error);
    } finally {
        mongoose.connection.close();
        process.exit(0);
    }
};

seedProductsAndServices();
