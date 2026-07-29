const mongoose = require('mongoose');
const Slider = require('./models/Slider');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/justdial';

async function checkSliders() {
    try {
        await mongoose.connect(MONGO_URI);
        const count = await Slider.countDocuments();
        console.log(`Total Sliders in DB: ${count}`);
        const sliders = await Slider.find();
        sliders.forEach(s => console.log(`- ${s.title}: ${s.image}`));
    } catch (err) {
        console.error(err);
    } finally {
        mongoose.connection.close();
    }
}

checkSliders();
