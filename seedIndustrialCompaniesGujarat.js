const mongoose = require('mongoose');
require('dotenv').config();
const Company = require('./models/Company');
const Category = require('./models/Category');
const Country = require('./models/Country');
const State = require('./models/State');
const City = require('./models/City');
const Area = require('./models/Area');

async function seedIndustrialCompaniesGujarat() {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/justdial');
        console.log('✅ Connected to DB');

        // Get references
        const india = await Country.findOne({ code: 'IN' });
        const gujarat = await State.findOne({ name: 'Gujarat', country_id: india._id });
        const rajkot = await City.findOne({ name: 'Rajkot', state_id: gujarat._id });
        const ahmedabad = await City.findOne({ name: 'Ahmedabad', state_id: gujarat._id });
        const surat = await City.findOne({ name: 'Surat', state_id: gujarat._id });
        const aji = await Area.findOne({ name: 'Aji Industrial Area', city_id: rajkot._id });
        const shapar = await Area.findOne({ name: 'Shapar', city_id: rajkot._id });
        const gidc = await Area.findOne({ name: 'GIDC Metoda', city_id: rajkot._id });
        const cgroad = await Area.findOne({ name: 'C.G. Road', city_id: ahmedabad._id });
        const adajan = await Area.findOne({ name: 'Adajan', city_id: surat._id });

        // Get all industrial categories
        const categories = await Category.find({ slug: { $in: [
            'machine-tools','printing-machinery','motors-gears-drives','machine-tools-accessories','packaging-machinery','bolt-nut-fastener-spring-manufacturers','robotic-automation','cutting-tools','rubber-belt-v-belt','cnc-vmc-hmc-manufacturers','power-tools-hand-tools','air-compressors','control-panels','material-handling-construction','abrasives','welding-equipment','crane-hoist-chain-pulley-block','powder-coating-equipment-materials','transformers','chain-sprocket','lubricating-oil-grease','laser-marking-cutting','castor-wheel-trolley-wheel','bank-financial-institutions','industrial-safety','electrical-electronics','currency-counting-machines','hydraulics-equipment','pneumatics-systems'] } });

        // Map categories to locations for realism
        const cityAreaMap = [
            { city: rajkot, area: aji },
            { city: rajkot, area: shapar },
            { city: rajkot, area: gidc },
            { city: ahmedabad, area: cgroad },
            { city: surat, area: adajan }
        ];

        let created = 0;
        for (let i = 0; i < categories.length; i++) {
            const cat = categories[i];
            const loc = cityAreaMap[i % cityAreaMap.length];
            const companyName = `${cat.name} Solutions ${loc.city.name}`;
            const slug = `${cat.slug}-solutions-${loc.city.name.toLowerCase()}`;
            let exists = await Company.findOne({ slug });
            if (!exists) {
                await Company.create({
                    name: companyName,
                    slug,
                    category: cat.name,
                    category_id: cat._id,
                    country_id: india._id,
                    state_id: gujarat._id,
                    city_id: loc.city._id,
                    area_id: loc.area?._id,
                    address: `${cat.name} Industrial Area, ${loc.city.name}, Gujarat`,
                    description: `Leading ${cat.name.toLowerCase()} company in ${loc.city.name}, Gujarat.`,
                    status: 'Active',
                    claimed: true,
                    verified: true,
                    image: cat.image,
                    logo: cat.image
                });
                console.log(`🏭 Created company: ${companyName}`);
                created++;
            }
        }

        console.log(`\n🎉 Seeded ${created} industrial companies in Gujarat!`);
        process.exit(0);
    } catch (err) {
        console.error('❌ Seeding error:', err);
        process.exit(1);
    }
}

seedIndustrialCompaniesGujarat();
