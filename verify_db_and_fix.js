const mongoose = require('mongoose');
const User = require('./models/User');
const Company = require('./models/Company');
require('dotenv').config();

async function run() {
    const uris = [
        process.env.MONGO_URI,
        'mongodb://127.0.0.1:27017/fuerte_db',
        'mongodb://127.0.0.1:27017/justdial'
    ].filter(Boolean);

    let connected = false;
    for (const uri of uris) {
        try {
            console.log(`Trying to connect to: ${uri}`);
            await mongoose.connect(uri, { serverSelectionTimeoutMS: 2000 });
            console.log('✅ Connected successfully');
            connected = true;
            break;
        } catch (err) {
            console.log(`❌ Failed to connect to ${uri}: ${err.message}`);
        }
    }

    if (!connected) {
        console.error('Could not connect to any database');
        process.exit(1);
    }

    try {
        const rahul = await User.findOne({ email: 'rahul@example.com' });
        if (!rahul) {
            console.error('User rahul@example.com not found');
            process.exit(1);
        }
        console.log(`Found Rahul: ${rahul._id}`);

        const companies = await Company.find().limit(5);
        if (companies.length === 0) {
            console.log('No companies found in DB to assign');
        } else {
            for (const company of companies) {
                company.owner = rahul._id;
                company.claimed = true;
                company.verified = true;
                company.status = 'Approved';
                await company.save();
                console.log(`Assigned "${company.name}" to Rahul`);
            }
            
            rahul.companiesOwned = companies.length;
            await rahul.save();
            console.log(`Updated Rahul's companiesOwned count to ${companies.length}`);
        }

        console.log('Data fix complete');
        process.exit(0);
    } catch (err) {
        console.error('Operation failed:', err);
        process.exit(1);
    }
}

run();
