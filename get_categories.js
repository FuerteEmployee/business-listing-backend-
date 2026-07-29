const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

const Category = require('./models/Category');
const City = require('./models/City');

async function check() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        const categories = await Category.find({}).limit(10);
        console.log('Categories:', categories.map(c => ({ id: c._id, name: c.name })));

        const cities = await City.find({}).limit(5);
        console.log('Cities:', cities.map(c => ({ id: c._id, name: c.name })));

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

check();
