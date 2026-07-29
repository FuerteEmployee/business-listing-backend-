const mongoose = require('mongoose');
const Plan = require('./models/Plan');
require('dotenv').config();

const plans = [
    {
        name: 'Free',
        slug: 'free',
        description: 'Basic business listing',
        priceMonthly: 0,
        priceAnnual: 0,
        features: [
            { key: 'profile_listing', label: 'Basic Profile Listing', enabled: true },
            { key: 'phone_display', label: 'Phone Number Display', enabled: true },
            { key: 'photos_limit', label: 'Up to 5 Photos', enabled: true },
            { key: 'analytics_basic', label: 'Basic Analytics', enabled: true }
        ],
        displayOrder: 1
    },
    {
        name: 'Standard',
        slug: 'standard',
        description: 'Enhanced visibility and leads',
        priceMonthly: 999,
        priceAnnual: 9999,
        features: [
            { key: 'profile_listing', label: 'Basic Profile Listing', enabled: true },
            { key: 'phone_display', label: 'Phone Number Display', enabled: true },
            { key: 'photos_limit', label: 'Up to 20 Photos', enabled: true },
            { key: 'analytics_advanced', label: 'Advanced Analytics (Weekly)', enabled: true },
            { key: 'verified_badge', label: 'Verified Badge', enabled: true },
            { key: 'priority_search', label: 'Priority in Search Results', enabled: true }
        ],
        displayOrder: 2
    },
    {
        name: 'Premium',
        slug: 'premium',
        description: 'Top priority and full analytics',
        priceMonthly: 2499,
        priceAnnual: 24999,
        features: [
            { key: 'profile_listing', label: 'Basic Profile Listing', enabled: true },
            { key: 'phone_display', label: 'Phone Number Display', enabled: true },
            { key: 'photos_limit', label: 'Unlimited Photos', enabled: true },
            { key: 'analytics_realtime', label: 'Real-time Rich Analytics', enabled: true },
            { key: 'verified_badge', label: 'Verified Badge', enabled: true },
            { key: 'top_priority', label: 'Top Priority in Category', enabled: true },
            { key: 'whatsapp_leads', label: 'Instant WhatsApp Lead Alerts', enabled: true }
        ],
        displayOrder: 3
    }
];

const seedPlans = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/trinetra');
        console.log('Connected to MongoDB for seeding...');
        
        await Plan.deleteMany();
        console.log('Cleared existing plans.');
        
        await Plan.insertMany(plans);
        console.log('Successfully seeded plans.');
        
        process.exit();
    } catch (err) {
        console.error('Error seeding plans:', err);
        process.exit(1);
    }
};

seedPlans();
