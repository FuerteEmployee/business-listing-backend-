const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

const Setting = require('./models/Setting');

async function checkSettings() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        const settings = await Setting.findOne();
        if (!settings) {
            console.log('No settings found');
        } else {
            console.log('Settings found:');
            console.log(JSON.stringify(settings, null, 2));
            console.log('\nHomepage Social Links:', settings.homepage?.socialLinks);
        }

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
    }
}

checkSettings();
