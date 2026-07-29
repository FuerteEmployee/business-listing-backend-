
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('./models/User');
const Company = require('./models/Company');
const Product = require('./models/Product');
require('dotenv').config();

async function testIsolation() {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/justdial');
    console.log('Connected to DB');

    // 1. Find a Brand Owner
    const brandOwner = await User.findOne({ role: 'Brand Owner' });
    if (!brandOwner) {
        console.log('No Brand Owner found for testing');
        process.exit();
    }
    console.log(`Testing with Brand Owner: ${brandOwner.email}`);

    // 2. Find their companies
    const ownedCompanies = await Company.find({ owner: brandOwner._id });
    console.log(`Owned companies: ${ownedCompanies.map(c => c.name).join(', ')}`);

    // 3. Simulated request data
    const req = {
        user: brandOwner,
        ownedBrandIds: ownedCompanies.map(c => c._id),
        query: { owned: 'true' }
    };

    // Test cases (conceptual check of the logic we wrote)
    console.log('\n--- Logic Verification ---');
    
    // Company Logic
    const companyQuery = { owner: req.user._id };
    console.log(`Company query with ?owned=true:`, companyQuery);
    
    // Product Logic
    const productQuery = { listingId: { $in: req.ownedBrandIds } };
    console.log(`Product query with ?owned=true:`, productQuery);

    process.exit();
}

testIsolation().catch(err => {
    console.error(err);
    process.exit(1);
});
