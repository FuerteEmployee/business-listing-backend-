const mongoose = require('mongoose');
const Category = require('./models/Category');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/justdial';

const industrialCategories = [
    {
        name: 'Machine Tools',
        slug: 'machine-tools',
        image: 'https://img.icons8.com/color/512/lathe.png'
    },
    {
        name: 'Printing Machinery',
        slug: 'printing-machinery',
        image: 'https://img.icons8.com/color/512/print.png'
    },
    {
        name: 'Motors, Gears & Drives',
        slug: 'motors-gears-drives',
        image: 'https://img.icons8.com/color/512/engine.png'
    },
    {
        name: 'Machine Tools Accessories',
        slug: 'machine-tools-accessories',
        image: 'https://img.icons8.com/color/512/drill.png'
    },
    {
        name: 'Packaging Machinery',
        slug: 'packaging-machinery',
        image: 'https://img.icons8.com/color/512/box.png'
    },
    {
        name: 'Bolt / Nut / Fastener / Spring Manufacturers',
        slug: 'bolt-nut-fastener-spring-manufacturers',
        image: 'https://img.icons8.com/color/512/screw.png'
    },
    {
        name: 'Robotic / Automation',
        slug: 'robotic-automation',
        image: 'https://img.icons8.com/color/512/robot-arm.png'
    },
    {
        name: 'Cutting Tools',
        slug: 'cutting-tools',
        image: 'https://img.icons8.com/color/512/saw.png'
    },
    {
        name: 'Rubber Belt / V-Belt',
        slug: 'rubber-belt-v-belt',
        image: 'https://img.icons8.com/color/512/timing-belt.png'
    },
    {
        name: 'CNC / VMC / HMC Manufacturers',
        slug: 'cnc-vmc-hmc-manufacturers',
        image: 'https://img.icons8.com/color/512/control-panel.png'
    },
    {
        name: 'Power Tools & Hand Tools',
        slug: 'power-tools-hand-tools',
        image: 'https://img.icons8.com/color/512/toolbox.png'
    },
    {
        name: 'Air Compressors',
        slug: 'air-compressors',
        image: 'https://img.icons8.com/color/512/air-compressor.png'
    },
    {
        name: 'Control Panels',
        slug: 'control-panels',
        image: 'https://img.icons8.com/color/512/electrical-panel.png'
    },
    {
        name: 'Material Handling & Construction',
        slug: 'material-handling-construction',
        image: 'https://img.icons8.com/color/512/crane.png'
    },
    {
        name: 'Abrasives',
        slug: 'abrasives',
        image: 'https://img.icons8.com/color/512/grinding-wheel.png'
    },
    {
        name: 'Welding Equipment',
        slug: 'welding-equipment',
        image: 'https://img.icons8.com/color/512/welding.png'
    },
    {
        name: 'Crane / Hoist / Chain Pulley Block',
        slug: 'crane-hoist-chain-pulley-block',
        image: 'https://img.icons8.com/color/512/winch.png'
    },
    {
        name: 'Powder Coating Equipment / Materials',
        slug: 'powder-coating-equipment-materials',
        image: 'https://img.icons8.com/color/512/paint-sprayer.png'
    },
    {
        name: 'Transformers',
        slug: 'transformers',
        image: 'https://img.icons8.com/color/512/transformer.png'
    },
    {
        name: 'Chain & Sprocket',
        slug: 'chain-sprocket',
        image: 'https://img.icons8.com/color/512/chain.png'
    },
    {
        name: 'Lubricating Oil / Grease',
        slug: 'lubricating-oil-grease',
        image: 'https://img.icons8.com/color/512/oil-industry.png'
    },
    {
        name: 'Laser Marking & Cutting',
        slug: 'laser-marking-cutting',
        image: 'https://img.icons8.com/color/512/laser-beam.png'
    },
    {
        name: 'Castor Wheel / Trolley Wheel',
        slug: 'castor-wheel-trolley-wheel',
        image: 'https://img.icons8.com/color/512/trolley.png'
    },
    {
        name: 'Bank & Financial Institutions',
        slug: 'bank-financial-institutions',
        image: 'https://img.icons8.com/color/512/bank.png'
    },
    {
        name: 'Industrial Safety',
        slug: 'industrial-safety',
        image: 'https://img.icons8.com/color/512/safety-helmet.png'
    },
    {
        name: 'Electrical & Electronics',
        slug: 'electrical-electronics',
        image: 'https://img.icons8.com/color/512/circuit.png'
    },
    {
        name: 'Currency Counting Machines',
        slug: 'currency-counting-machines',
        image: 'https://img.icons8.com/color/512/money-box.png'
    },
    {
        name: 'Hydraulics Equipment',
        slug: 'hydraulics-equipment',
        image: 'https://img.icons8.com/color/512/piston.png'
    },
    {
        name: 'Pneumatics Systems',
        slug: 'pneumatics-systems',
        image: 'https://img.icons8.com/color/512/air-pump.png'
    }
];

const seedIndustrialDB = async () => {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('✅ Connected to MongoDB');

        // Note: We are ADDING these categories as top-level, not clearing. 
        // If we want to avoid duplicates, we should check by slug.
        
        let addedCount = 0;
        let updatedCount = 0;
        let skippedCount = 0;

        for (const catData of industrialCategories) {
            const existing = await Category.findOne({ slug: catData.slug });
            if (!existing) {
                const newCategory = new Category({
                    ...catData,
                    status: 'Active',
                    subCount: 0,
                    parent: null
                });
                await newCategory.save();
                console.log(`📂 Created industrial category: ${newCategory.name}`);
                addedCount++;
            } else {
                // Update existing to ensure it's top-level
                if (existing.parent !== null) {
                    await Category.updateOne({ slug: catData.slug }, { parent: null });
                    console.log(`🔄 Updated category to top-level: ${catData.name}`);
                    updatedCount++;
                } else {
                    console.log(`⚠️  Category already exists as top-level: ${catData.name}`);
                    skippedCount++;
                }
            }
        }

        console.log(`\n🚀 Seeding completed! Added: ${addedCount}, Updated: ${updatedCount}, Skipped: ${skippedCount}`);
    } catch (err) {
        console.error('❌ Seeding failed:', err);
    } finally {
        mongoose.connection.close();
        process.exit(0);
    }
};

seedIndustrialDB();
