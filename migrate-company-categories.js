
const mongoose = require('mongoose');
require('dotenv').config();
const Company = require('./models/Company');
const Category = require('./models/Category');

async function migrate() {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/justdial');
    console.log('Connected to DB');

    const companies = await Company.find({ category_id: null });
    console.log(`Found ${companies.length} companies to migrate`);

    for (const company of companies) {
        if (!company.category) continue;
        
        const category = await Category.findOne({ name: company.category });
        if (category) {
            company.category_id = category._id;
            await company.save();
            console.log(`Migrated ${company.name} to category ${category.name}`);
        } else {
            console.log(`Could not find category for ${company.name} (Category: ${company.category})`);
        }
    }

    console.log('Migration completed');
    process.exit(0);
}

migrate();
