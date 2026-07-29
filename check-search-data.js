
const mongoose = require('mongoose');
require('dotenv').config();
const Category = require('./models/Category');
const Company = require('./models/Company');

async function check() {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/justdial');
    
    const cat = await Category.findOne({ slug: 'machine-tools' });
    if (cat) {
        console.log(`Category: ${cat.name}, ID: ${cat._id}, SubCount: ${cat.subCount}`);
        const companiesCount = await Company.countDocuments({ category_id: cat._id });
        console.log(`Companies with this category_id: ${companiesCount}`);
    } else {
        console.log('Category machine-tools not found');
    }
    
    process.exit(0);
}

check();
