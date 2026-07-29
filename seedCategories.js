const mongoose = require('mongoose');
const Category = require('./models/Category');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/justdial';

const categories = [
    {
        name: 'Restaurants',
        slug: 'restaurants',
        image: 'https://img.icons8.com/color/512/restaurant.png',
        subcategories: [
            { name: 'Fine Dining', slug: 'fine-dining', image: 'https://img.icons8.com/color/512/restaurant-menu.png' },
            { name: 'Cafes', slug: 'cafes', image: 'https://img.icons8.com/color/512/cafe.png' },
            { name: 'Fast Food', slug: 'fast-food', image: 'https://img.icons8.com/color/512/hamburger.png' }
        ]
    },
    {
        name: 'Hotels',
        slug: 'hotels',
        image: 'https://img.icons8.com/color/512/hotel.png',
        subcategories: [
            { name: 'Luxury Hotels', slug: 'luxury-hotels', image: 'https://img.icons8.com/color/512/star-hotel.png' },
            { name: 'Budget Hotels', slug: 'budget-hotels', image: 'https://img.icons8.com/color/512/hostel.png' },
            { name: 'Resorts', slug: 'resorts', image: 'https://img.icons8.com/color/512/beach.png' }
        ]
    },
    {
        name: 'Education',
        slug: 'education',
        image: 'https://img.icons8.com/color/512/school.png',
        subcategories: [
            { name: 'Schools', slug: 'schools', image: 'https://img.icons8.com/color/512/classroom.png' },
            { name: 'Colleges', slug: 'colleges', image: 'https://img.icons8.com/color/512/university.png' },
            { name: 'Coaching Centers', slug: 'coaching-centers', image: 'https://img.icons8.com/color/512/conference-call.png' }
        ]
    },
    {
        name: 'Health',
        slug: 'health',
        image: 'https://img.icons8.com/color/512/health.png',
        subcategories: [
            { name: 'Hospitals', slug: 'hospitals', image: 'https://img.icons8.com/color/512/hospital.png' },
            { name: 'Clinics', slug: 'clinics', image: 'https://img.icons8.com/color/512/clinic.png' },
            { name: 'Pharmacies', slug: 'pharmacies', image: 'https://img.icons8.com/color/512/pills.png' }
        ]
    },
    {
        name: 'Home Services',
        slug: 'home-services',
        image: 'https://img.icons8.com/color/512/plumber-tool.png',
        subcategories: [
            { name: 'Plumbers', slug: 'plumbers', image: 'https://img.icons8.com/color/512/plumber.png' },
            { name: 'Electricians', slug: 'electricians', image: 'https://img.icons8.com/color/512/electrician.png' },
            { name: 'Carpenters', slug: 'carpenters', image: 'https://img.icons8.com/color/512/hammer.png' }
        ]
    },
    {
        name: 'Beauty',
        slug: 'beauty',
        image: 'https://img.icons8.com/color/512/mac-makeup.png',
        subcategories: [
            { name: 'Salons', slug: 'salons', image: 'https://img.icons8.com/color/512/barbershop.png' },
            { name: 'Spas', slug: 'spas', image: 'https://img.icons8.com/color/512/spa.png' },
            { name: 'Makeup Artists', slug: 'makeup-artists', image: 'https://img.icons8.com/color/512/makeup.png' }
        ]
    },
    {
        name: 'Electronics',
        slug: 'electronics',
        image: 'https://img.icons8.com/color/512/electronics.png',
        subcategories: [
            { name: 'Mobile Phones', slug: 'mobile-phones', image: 'https://img.icons8.com/color/512/iphone.png' },
            { name: 'Laptops', slug: 'laptops', image: 'https://img.icons8.com/color/512/laptop.png' },
            { name: 'Accessories', slug: 'accessories', image: 'https://img.icons8.com/color/512/headphones.png' }
        ]
    }
];

const seedDB = async () => {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('✅ Connected to MongoDB');

        // Clear existing categories
        await Category.deleteMany({});
        console.log('🗑️  Cleared existing categories');

        for (const catData of categories) {
            const { subcategories, ...mainCatData } = catData;
            
            // Create main category
            const mainCategory = new Category({
                ...mainCatData,
                status: 'Active',
                subCount: subcategories.length
            });
            await mainCategory.save();
            console.log(`📂 Created main category: ${mainCategory.name}`);

            // Create subcategories
            for (const subData of subcategories) {
                const subCategory = new Category({
                    ...subData,
                    parent: mainCategory._id,
                    status: 'Active',
                    subCount: 0
                });
                await subCategory.save();
                console.log(`   └─ Created subcategory: ${subCategory.name}`);
            }
        }

        console.log('🚀 Seeding completed successfully with vector icons!');
    } catch (err) {
        console.error('❌ Seeding failed:', err);
    } finally {
        mongoose.connection.close();
    }
};

seedDB();
