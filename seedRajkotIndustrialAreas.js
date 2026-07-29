const mongoose = require('mongoose');
require('dotenv').config();
const City = require('./models/City');
const Area = require('./models/Area');

async function seedRajkotIndustrialAreas() {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/justdial');
        console.log('✅ Connected to DB');

        // Find Rajkot city
        const rajkot = await City.findOne({ name: 'Rajkot' });
        if (!rajkot) {
            console.log('❌ Rajkot city not found. Please seed cities first.');
            process.exit(1);
        }

        // Industrial/Business areas in Rajkot (with sample pincodes)
        const areas = [
            { name: 'Aji Industrial Area', slug: 'aji-industrial-area', pincode: '360003' },
            { name: 'Shapar', slug: 'shapar', pincode: '360024' },
            { name: 'GIDC Metoda', slug: 'gidc-metoda', pincode: '360021' },
            { name: 'Bhaktinagar', slug: 'bhaktinagar', pincode: '360002' },
            { name: 'Gondal Road', slug: 'gondal-road', pincode: '360004' },
            { name: 'Kalawad Road', slug: 'kalawad-road', pincode: '360005' },
            { name: 'Mavdi', slug: 'mavdi', pincode: '360004' },
            { name: 'Kothariya', slug: 'kothariya', pincode: '360002' },
            { name: 'Dhebar Road', slug: 'dhebar-road', pincode: '360002' },
            { name: 'Rajputpara', slug: 'rajputpara', pincode: '360001' }
        ];

        let created = 0;
        for (const area of areas) {
            let exists = await Area.findOne({ name: area.name, city_id: rajkot._id });
            if (!exists) {
                await Area.create({ ...area, city_id: rajkot._id, status: 'Active' });
                console.log(`🏭 Created area: ${area.name}`);
                created++;
            }
        }

        console.log(`\n🎉 Seeded ${created} industrial/business areas in Rajkot!`);
        process.exit(0);
    } catch (err) {
        console.error('❌ Seeding error:', err);
        process.exit(1);
    }
}

seedRajkotIndustrialAreas();
