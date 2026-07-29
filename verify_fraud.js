const mongoose = require('mongoose');
const Company = require('./models/Company');
const Review = require('./models/Review');
const FraudAlert = require('./models/FraudAlert');
const Blacklist = require('./models/Blacklist');
const User = require('./models/User');

const MONGO_URI = 'mongodb://127.0.0.1:27017/fuerte_db';

const runVerification = async () => {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('Connected to MongoDB');

        // 1. Create a blacklisted IP
        const testIP = '1.2.3.4';
        await Blacklist.deleteOne({ value: testIP });
        await Blacklist.create({
            type: 'ip',
            value: testIP,
            reason: 'Verification test',
            addedBy: new mongoose.Types.ObjectId()
        });
        console.log('Created blacklisted IP');

        // 2. Simulate review from blacklisted IP
        const { realTimeFraudCheck } = require('./controllers/fraudController');
        const metadata = { ipAddress: testIP };
        const result = await realTimeFraudCheck('review', { businessId: new mongoose.Types.ObjectId(), comment: 'Normal review' }, new mongoose.Types.ObjectId(), metadata);
        
        console.log('Fraud Check Result for blacklisted IP:', JSON.stringify(result, null, 2));

        // 3. Test Spam Content
        const spamComment = 'Buy cheap viagra now at casino betting crypto';
        const spamResult = await realTimeFraudCheck('review', { businessId: new mongoose.Types.ObjectId(), comment: spamComment }, new mongoose.Types.ObjectId(), { ipAddress: '5.6.7.8' });
        console.log('Spam Content Check Result:', JSON.stringify(spamResult, null, 2));

        // 4. Test Duplicate Phone
        const testPhone = '9998887776';
        await Company.create({
            name: 'Existing Company',
            slug: 'existing-company-' + Date.now(),
            phone: testPhone,
            category: 'Industrial',
            address: 'Rajkot'
        });

        const dupPhoneResult = await realTimeFraudCheck('listing', { name: 'New Company', description: 'desc', phone: testPhone }, new mongoose.Types.ObjectId(), { ipAddress: '5.6.7.8' });
        console.log('Duplicate Phone Check Result:', JSON.stringify(dupPhoneResult, null, 2));

        await mongoose.disconnect();
        console.log('Verification script completed');
    } catch (err) {
        console.error('Verification error:', err);
        process.exit(1);
    }
};

runVerification();
