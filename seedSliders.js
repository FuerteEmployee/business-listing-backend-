const mongoose = require('mongoose');
const Slider = require('./models/Slider');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/justdial';

const initialSliders = [
    {
        title: 'Find Top Rated Restaurants',
        description: 'Discover the best dining experiences and cafes in your city.',
        image: 'https://images.unsplash.com/photo-1552566626-52f8b828add9?q=80&w=1200&h=400&auto=format&fit=crop',
        link: '/search?category=restaurants',
        status: 'Active',
        order: 1
    },
    {
        title: 'Expert Home Services',
        description: 'Verified plumbers, electricians, and carpenters at your doorstep.',
        image: 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?q=80&w=1200&h=400&auto=format&fit=crop',
        link: '/search?category=home-services',
        status: 'Active',
        order: 2
    },
    {
        title: 'Best Healthcare Specialists',
        description: 'Connect with top doctors, clinics, and hospitals near you.',
        image: 'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?q=80&w=1200&h=400&auto=format&fit=crop',
        link: '/search?category=health',
        status: 'Active',
        order: 3
    },
    {
        title: 'Latest Electronics & Gadgets',
        description: 'Shop for the newest smartphones, laptops, and accessories.',
        image: 'https://images.unsplash.com/photo-1491933382434-500287f9b54b?q=80&w=1200&h=400&auto=format&fit=crop',
        link: '/search?category=electronics',
        status: 'Active',
        order: 4
    },
    {
        title: 'Premium Beauty & Wellness',
        description: 'Book appointments at top salons, spas, and makeup studios.',
        image: 'https://images.unsplash.com/photo-1560066984-138dadb4c035?q=80&w=1200&h=400&auto=format&fit=crop',
        link: '/search?category=beauty',
        status: 'Active',
        order: 5
    },
    {
        title: 'Luxury Hotels & Resorts',
        description: 'Plan your perfect getaway with the finest hotels and resorts.',
        image: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?q=80&w=1200&h=400&auto=format&fit=crop',
        link: '/search?category=hotels',
        status: 'Active',
        order: 6
    }
];

const seedSliders = async () => {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('✅ Connected to MongoDB');

        // Clear existing sliders
        await Slider.deleteMany({});
        console.log('🗑️  Cleared existing sliders');

        // Insert new sliders
        await Slider.insertMany(initialSliders);
        console.log(`🚀 Inserted ${initialSliders.length} sliders successfully!`);

    } catch (err) {
        console.error('❌ Seeding failed:', err);
    } finally {
        mongoose.connection.close();
    }
};

seedSliders();
