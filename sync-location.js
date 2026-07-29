const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
dns.setServers(['8.8.8.8', '8.8.4.4']);

const mongoose = require('mongoose');
const Company = require('./models/Company');
const dotenv = require('dotenv');

dotenv.config();

const syncLocation = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/business_listing');
        console.log('Connected to MongoDB');

        const companies = await Company.find({ 
            latitude: { $ne: null }, 
            longitude: { $ne: null },
            $or: [
                { location: { $exists: false } },
                { 'location.coordinates': [0, 0] }
            ]
        });

        console.log(`Found ${companies.length} companies to sync`);

        for (const company of companies) {
            company.location = {
                type: 'Point',
                coordinates: [company.longitude, company.latitude]
            };
            await company.save();
            console.log(`Synced: ${company.name}`);
        }

        console.log('Sync complete');
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

syncLocation();
