const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

const Category = require('./models/Category');
const City = require('./models/City');
const State = require('./models/State');
const Country = require('./models/Country');

async function check() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        const categories = await Category.find({});
        console.log('--- Categories ---');
        categories.forEach(c => console.log(`${c.name}: ${c._id}`));

        const city = await City.findOne({ name: /Rajkot/i });
        if (city) {
            console.log('--- Rajkot City Found ---');
            console.log(`ID: ${city._id}`);
            console.log(`StateID: ${city.state_id}`);
            
            const state = await State.findById(city.state_id);
            if (state) {
                console.log(`State: ${state.name}`);
                console.log(`CountryID: ${state.country_id}`);
                const country = await Country.findById(state.country_id);
                if (country) {
                    console.log(`Country: ${country.name}`);
                }
            }
        } else {
            console.log('Rajkot not found, finding any city...');
            const anyCity = await City.findOne({});
            if (anyCity) console.log(`Any City: ${anyCity.name} (${anyCity._id})`);
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

check();
