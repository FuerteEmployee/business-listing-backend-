
const mongoose = require('mongoose');
require('dotenv').config();
const Company = require('./models/Company');
const Category = require('./models/Category');

async function verify() {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/justdial');
    
    const companyCount = await Company.countDocuments({ claimed: false });
    const categoryCount = await Category.countDocuments();
    
    console.log(`Unclaimed Companies: ${companyCount}`);
    console.log(`Total Categories: ${categoryCount}`);
    
    const latestBrands = await Company.find({ claimed: false }).sort({ createdAt: -1 }).limit(5);
    console.log('Latest Unclaimed Brands:');
    latestBrands.forEach(b => console.log(`- ${b.name} (${b.category})`));
    
    process.exit(0);
}

verify();
