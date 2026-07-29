const mongoose = require('mongoose');
const User = require('./models/User');
const Company = require('./models/Company');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/justdial';

async function fixData() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('Connected to MongoDB');

        const rahul = await User.findOne({ email: 'rahul@example.com' });
        if (!rahul) {
            console.log('User rahul@example.com not found');
            process.exit(1);
        }

        // Assign first 3 companies to Rahul
        const companies = await Company.find().limit(3);
        const companyIds = companies.map(c => c._id);

        for (const company of companies) {
            company.owner = rahul._id;
            company.claimed = true;
            company.verified = true;
            await company.save();
            console.log(`Assigned ${company.name} to Rahul`);
        }

        rahul.companiesOwned = 3;
        await rahul.save();

        console.log('Data fixed successfully');
        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

fixData();
