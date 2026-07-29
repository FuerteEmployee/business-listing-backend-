const mongoose = require('mongoose');
require('dotenv').config();
const Country = require('./models/Country');
const State = require('./models/State');
const City = require('./models/City');

async function seedGujaratRajkotLocations() {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/justdial');
        console.log('✅ Connected to DB');

        // 1. Country: India
        let country = await Country.findOne({ code: 'IN' });
        if (!country) {
            country = await Country.create({ name: 'India', code: 'IN', status: 'Active' });
            console.log('🌏 Created country: India');
        } else {
            console.log('🌏 Country already exists: India');
        }

        // 2. State: Gujarat
        let state = await State.findOne({ name: 'Gujarat', country_id: country._id });
        if (!state) {
            state = await State.create({ name: 'Gujarat', country_id: country._id, status: 'Active' });
            console.log('🏞️ Created state: Gujarat');
        } else {
            console.log('🏞️ State already exists: Gujarat');
        }

        // 3. City: Rajkot
        let city = await City.findOne({ name: 'Rajkot', state_id: state._id });
        if (!city) {
            city = await City.create({ name: 'Rajkot', slug: 'rajkot', state_id: state._id, status: 'Active' });
            console.log('🏙️ Created city: Rajkot');
        } else {
            console.log('🏙️ City already exists: Rajkot');
        }

        // 4. Add a few more cities in Gujarat for realism
        const moreCities = [
            { name: 'Ahmedabad', slug: 'ahmedabad' },
            { name: 'Surat', slug: 'surat' },
            { name: 'Vadodara', slug: 'vadodara' },
            { name: 'Bhavnagar', slug: 'bhavnagar' },
            { name: 'Jamnagar', slug: 'jamnagar' }
        ];
        for (const c of moreCities) {
            let exists = await City.findOne({ name: c.name, state_id: state._id });
            if (!exists) {
                await City.create({ ...c, state_id: state._id, status: 'Active' });
                console.log(`🏙️ Created city: ${c.name}`);
            }
        }

        console.log('\n🎉 Gujarat & Rajkot locations seeded!');
        process.exit(0);
    } catch (err) {
        console.error('❌ Seeding error:', err);
        process.exit(1);
    }
}

seedGujaratRajkotLocations();
