const mongoose = require('mongoose');
require('dotenv').config();
const Product = require('./models/Product');
const Company = require('./models/Company');
const Category = require('./models/Category');

async function seedIndustrialProducts() {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/justdial');
        console.log('✅ Connected to DB');

        // Get some companies (use existing or create if needed)
        let companies = await Company.find().limit(5);
        if (companies.length === 0) {
            console.log('❌ No companies found. Please seed companies first.');
            process.exit(1);
        }

        // Get industrial categories
        const industrialCategories = await Category.find({
            name: {
                $in: [
                    'Machine Tools',
                    'Printing Machinery',
                    'Motors, Gears & Drives',
                    'Machine Tools Accessories',
                    'Packaging Machinery',
                    'Bolt / Nut / Fastener / Spring Manufacturers',
                    'Robotic / Automation',
                    'Cutting Tools',
                    'Rubber Belt / V-Belt',
                    'CNC / VMC / HMC Manufacturers',
                    'Power Tools & Hand Tools',
                    'Air Compressors',
                    'Control Panels',
                    'Material Handling & Construction',
                    'Abrasives',
                    'Welding Equipment',
                    'Crane / Hoist / Chain Pulley Block',
                    'Powder Coating Equipment / Materials',
                    'Transformers',
                    'Chain & Sprocket',
                    'Lubricating Oil / Grease',
                    'Laser Marking & Cutting',
                    'Castor Wheel / Trolley Wheel',
                    'Bank & Financial Institutions',
                    'Industrial Safety',
                    'Electrical & Electronics',
                    'Currency Counting Machines',
                    'Hydraulics Equipment',
                    'Pneumatics Systems'
                ]
            }
        });

        if (industrialCategories.length === 0) {
            console.log('❌ No industrial categories found. Please seed categories first.');
            process.exit(1);
        }

        console.log(`Found ${industrialCategories.length} industrial categories and ${companies.length} companies`);

        const products = [
            // Machine Tools
            {
                name: "CNC Lathe Machine",
                slug: "cnc-lathe-machine",
                description: "High-precision CNC lathe machine for metal turning operations. Features automatic tool changer and Fanuc control system.",
                shortDescription: "Precision CNC Lathe",
                price: 250000,
                categoryId: industrialCategories.find(c => c.name === 'Machine Tools')?._id,
                sku: "MT-CNC-001",
                stock: 3,
                status: "Active",
                images: ["https://images.unsplash.com/photo-1565043589221-1a6fd9ae45c7?auto=format&fit=crop&q=80&w=800"]
            },
            // Printing Machinery
            {
                name: "Industrial Inkjet Printer",
                slug: "industrial-inkjet-printer",
                description: "High-speed industrial inkjet printer for packaging and labeling. Supports various substrates with UV-curable inks.",
                shortDescription: "UV Industrial Printer",
                price: 85000,
                categoryId: industrialCategories.find(c => c.name === 'Printing Machinery')?._id,
                sku: "PM-IJP-001",
                stock: 5,
                status: "Active",
                images: ["https://images.unsplash.com/photo-1586214177158-9ddf099f2b8a?auto=format&fit=crop&q=80&w=800"]
            },
            // Motors, Gears & Drives
            {
                name: "AC Induction Motor 5HP",
                slug: "ac-induction-motor-5hp",
                description: "Three-phase AC induction motor, 5HP, 1440 RPM. Energy efficient with IE3 rating and IP55 protection.",
                shortDescription: "5HP Three-Phase Motor",
                price: 15000,
                categoryId: industrialCategories.find(c => c.name === 'Motors, Gears & Drives')?._id,
                sku: "MGD-ACM-001",
                stock: 20,
                status: "Active",
                images: ["https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&q=80&w=800"]
            },
            // Cutting Tools
            {
                name: "Carbide End Mill Set",
                slug: "carbide-end-mill-set",
                description: "Professional carbide end mill set with 10 pieces. Various sizes for CNC machining and milling operations.",
                shortDescription: "10pc Carbide End Mill Set",
                price: 2500,
                categoryId: industrialCategories.find(c => c.name === 'Cutting Tools')?._id,
                sku: "CT-CEM-001",
                stock: 15,
                status: "Active",
                images: ["https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&q=80&w=800"]
            },
            // Power Tools & Hand Tools
            {
                name: "Cordless Impact Wrench",
                slug: "cordless-impact-wrench",
                description: "18V cordless impact wrench with 400Nm torque. Brushless motor and lithium-ion battery for professional use.",
                shortDescription: "18V Cordless Impact Wrench",
                price: 8500,
                categoryId: industrialCategories.find(c => c.name === 'Power Tools & Hand Tools')?._id,
                sku: "PT-CIW-001",
                stock: 25,
                status: "Active",
                images: ["https://images.unsplash.com/photo-1578662996442-48f60103fc96?auto=format&fit=crop&q=80&w=800"]
            },
            // Air Compressors
            {
                name: "Rotary Screw Air Compressor",
                slug: "rotary-screw-air-compressor",
                description: "15HP rotary screw air compressor with 80 gallon tank. Oil-injected design for continuous duty operation.",
                shortDescription: "15HP Rotary Screw Compressor",
                price: 125000,
                categoryId: industrialCategories.find(c => c.name === 'Air Compressors')?._id,
                sku: "AC-RSC-001",
                stock: 2,
                status: "Active",
                images: ["https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&q=80&w=800"]
            },
            // Welding Equipment
            {
                name: "MIG Welding Machine",
                slug: "mig-welding-machine",
                description: "200A MIG welding machine with digital display. Suitable for steel, stainless steel, and aluminum welding.",
                shortDescription: "200A Digital MIG Welder",
                price: 35000,
                categoryId: industrialCategories.find(c => c.name === 'Welding Equipment')?._id,
                sku: "WE-MIG-001",
                stock: 8,
                status: "Active",
                images: ["https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&q=80&w=800"]
            },
            // Transformers
            {
                name: "Three Phase Transformer 100KVA",
                slug: "three-phase-transformer-100kva",
                description: "Oil-cooled three-phase distribution transformer, 100KVA, 11KV/433V. BIS certified with all accessories.",
                shortDescription: "100KVA Oil Transformer",
                price: 285000,
                categoryId: industrialCategories.find(c => c.name === 'Transformers')?._id,
                sku: "TF-3PT-001",
                stock: 1,
                status: "Active",
                images: ["https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&q=80&w=800"]
            },
            // Industrial Safety
            {
                name: "Safety Helmet with Face Shield",
                slug: "safety-helmet-face-shield",
                description: "Industrial safety helmet with integrated face shield. HDPE shell with adjustable headband and anti-fog coating.",
                shortDescription: "Industrial Safety Helmet",
                price: 450,
                categoryId: industrialCategories.find(c => c.name === 'Industrial Safety')?._id,
                sku: "IS-SHF-001",
                stock: 100,
                status: "Active",
                images: ["https://images.unsplash.com/photo-1584464491033-06628f3a6b7b?auto=format&fit=crop&q=80&w=800"]
            },
            // Hydraulics Equipment
            {
                name: "Hydraulic Pump Station",
                slug: "hydraulic-pump-station",
                description: "Complete hydraulic pump station with motor, pump, valves, and accumulator. 10HP power with pressure up to 200 bar.",
                shortDescription: "10HP Hydraulic Pump Station",
                price: 95000,
                categoryId: industrialCategories.find(c => c.name === 'Hydraulics Equipment')?._id,
                sku: "HE-HPS-001",
                stock: 4,
                status: "Active",
                images: ["https://images.unsplash.com/photo-1581094794329-c8112a89af12?auto=format&fit=crop&q=80&w=800"]
            }
        ];

        let createdCount = 0;
        for (const productData of products) {
            if (!productData.categoryId) continue; // Skip if category not found

            const existing = await Product.findOne({ sku: productData.sku });
            if (!existing) {
                const product = new Product({
                    ...productData,
                    listingId: companies[Math.floor(Math.random() * companies.length)]._id
                });
                await product.save();
                console.log(`📦 Created Product: ${product.name}`);
                createdCount++;
            } else {
                console.log(`⚠️  Product already exists: ${productData.name}`);
            }
        }

        console.log(`\n🎉 Successfully seeded ${createdCount} industrial products!`);
        process.exit(0);
    } catch (err) {
        console.error('❌ Seeding error:', err);
        process.exit(1);
    }
}

seedIndustrialProducts();