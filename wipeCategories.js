const mongoose = require('mongoose');
const Category = require('./models/Category');
require('dotenv').config();

const MONGO_URI = 'mongodb+srv://bharatfuerte:bharatfuerte@engitech.bnrh0l3.mongodb.net/engitech_db?retryWrites=true&w=majority';

async function wipeCategories() {
    try {
        console.log('Connecting to database...');
        await mongoose.connect(MONGO_URI);
        console.log('✅ Connected.');

        const count = await Category.countDocuments();
        console.log(`Found ${count} categories. Deleting them...`);

        const result = await Category.deleteMany({});
        console.log(`✅ Success. Deleted ${result.deletedCount} categories.`);

        process.exit(0);
    } catch (err) {
        console.error('❌ Error:', err.message);
        process.exit(1);
    }
}

wipeCategories();
