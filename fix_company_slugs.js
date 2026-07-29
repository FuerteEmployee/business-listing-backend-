const mongoose = require('mongoose');
const slugify = require('slugify');
require('dotenv').config();
const Company = require('./models/Company');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/justdial';

const fixSlugs = async () => {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('✅ Connected to MongoDB');

        const companies = await Company.find({ slug: { $exists: false } });
        console.log(`🔍 Found ${companies.length} companies without slugs`);

        for (const company of companies) {
            company.slug = slugify(company.name, { lower: true, strict: true });
            
            // Check for duplicate slugs
            let slugExists = await Company.findOne({ slug: company.slug, _id: { $ne: company._id } });
            let counter = 1;
            let originalSlug = company.slug;
            while (slugExists) {
                company.slug = `${originalSlug}-${counter}`;
                slugExists = await Company.findOne({ slug: company.slug, _id: { $ne: company._id } });
                counter++;
            }

            await company.save();
            console.log(`✅ Fixed slug for: ${company.name} -> ${company.slug}`);
        }

        console.log('✨ All slugs fixed successfully');
        process.exit(0);
    } catch (err) {
        console.error('❌ Error fixing slugs:', err.message);
        process.exit(1);
    }
};

fixSlugs();
