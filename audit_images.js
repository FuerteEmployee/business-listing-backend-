const mongoose = require('mongoose');
const Category = require('./models/Category');
const Slider = require('./models/Slider');
const Product = require('./models/Product');
const Company = require('./models/Company');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/justdial';

async function auditImages() {
    try {
        await mongoose.connect(MONGO_URI);
        
        console.log('--- Categories ---');
        const cats = await Category.find();
        cats.forEach(c => {
            if (!c.image) console.log(`[MISSING] Category: ${c.name}`);
            else console.log(`[OK] Category: ${c.name} -> ${c.image}`);
        });

        console.log('\n--- Sliders ---');
        const sliders = await Slider.find();
        sliders.forEach(s => {
            if (!s.image) console.log(`[MISSING] Slider: ${s.title}`);
            else console.log(`[OK] Slider: ${s.title} -> ${s.image}`);
        });

        console.log('\n--- Companies ---');
        const companies = await Company.find().limit(5);
        companies.forEach(c => {
            console.log(`Company: ${c.name}, Logo: ${c.logo}, Image: ${c.image}`);
        });

    } catch (err) {
        console.error(err);
    } finally {
        mongoose.connection.close();
    }
}

auditImages();
