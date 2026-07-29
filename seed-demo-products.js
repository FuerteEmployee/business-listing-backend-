
const mongoose = require('mongoose');
require('dotenv').config();
const Product = require('./models/Product');
const Company = require('./models/Company');
const Category = require('./models/Category');

async function seedProducts() {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/justdial');
        console.log('Connected to DB');

        const primeHydraulic = await Company.findOne({ name: 'Prime Hydraulic & Engineers' });
        const machineToolsCat = await Category.findOne({ name: 'Pneumatics Systems' });

        if (!primeHydraulic || !machineToolsCat) {
            console.log('Prime Hydraulic or Category not found');
            process.exit(1);
        }

        const products = [
            {
                name: "Double Acting Hydraulic Cylinder",
                slug: "double-acting-hydraulic-cylinder",
                description: "High-pressure double acting hydraulic cylinder for industrial applications. Made with premium quality steel and precision-honed tubes.",
                shortDescription: "Industrial Grade Hydraulic Cylinder",
                price: 15500,
                listingId: primeHydraulic._id,
                categoryId: machineToolsCat._id,
                sku: "PH-HYD-001",
                stock: 10,
                status: "Active",
                images: ["https://images.unsplash.com/photo-1590950664547-862a96700c3b?auto=format&fit=crop&q=80&w=800"]
            },
            {
                name: "Hydraulic Power Pack Unit",
                slug: "hydraulic-power-pack-unit",
                description: "Compact and powerful hydraulic power pack unit for machinery. Features a high-efficiency motor and adjustable pressure control.",
                shortDescription: "5HP Hydraulic Power Unit",
                price: 45000,
                listingId: primeHydraulic._id,
                categoryId: machineToolsCat._id,
                sku: "PH-PP-002",
                stock: 5,
                status: "Active",
                images: ["https://images.unsplash.com/photo-1597430302741-289873f40f35?auto=format&fit=crop&q=80&w=800"]
            },
            {
                name: "Pneumatic Directional Control Valve",
                slug: "pneumatic-directional-control-valve",
                description: "5/2 way solenoid-operated directional control valve. Reliable performance for pneumatic automation circuits.",
                shortDescription: "5/2 Way Solenoid Valve",
                price: 2800,
                listingId: primeHydraulic._id,
                categoryId: machineToolsCat._id,
                sku: "PH-VAL-003",
                stock: 50,
                status: "Active",
                images: ["https://images.unsplash.com/photo-1614935151651-0bea6508db6b?auto=format&fit=crop&q=80&w=800"]
            }
        ];

        for (const p of products) {
            const existing = await Product.findOne({ sku: p.sku });
            if (!existing) {
                await Product.create(p);
                console.log(`Created Product: ${p.name}`);
            }
        }

        console.log('Demo products seeded successfully');
        process.exit(0);
    } catch (err) {
        console.error('Seeding error:', err);
        process.exit(1);
    }
}

seedProducts();
