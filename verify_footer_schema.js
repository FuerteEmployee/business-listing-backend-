const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

const Setting = require('./models/Setting');

async function testUpdate() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        let settings = await Setting.findOne();
        if (!settings) {
            settings = new Setting();
        }

        console.log('Current sections count:', settings.homepage?.footerSections?.length || 0);

        const testSection = {
            id: 'test-' + Date.now(),
            title: 'Script Test Section',
            links: [
                { label: 'Google', url: 'https://google.com', type: 'external' }
            ]
        };

        if (!settings.homepage) settings.homepage = {};
        
        // Try direct assignment first
        settings.homepage.footerSections = [testSection];
        settings.markModified('homepage.footerSections');
        settings.markModified('homepage');

        console.log('Attempting to save...');
        const saved = await settings.save();
        
        console.log('Saved successfully');
        console.log('Saved sections:', JSON.stringify(saved.homepage.footerSections, null, 2));

        if (saved.homepage.footerSections && saved.homepage.footerSections.length > 0) {
            console.log('SUCCESS: Footer sections persisted via script');
        } else {
            console.log('FAILURE: Footer sections NOT persisted via script');
        }

        await mongoose.disconnect();
    } catch (err) {
        console.error('Update failed:', err);
        process.exit(1);
    }
}

testUpdate();
