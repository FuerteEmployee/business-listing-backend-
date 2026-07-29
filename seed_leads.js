const mongoose = require('mongoose');
require('dotenv').config();
const Lead = require('./models/Lead');

const dummyLeads = [
    {
        name: "Rahul Sharma",
        phone: "9876543210",
        category: "Software",
        type: "Requirement",
        status: "New",
        priority: "Hot",
        source: "Direct Inquiry",
        notes: [{ text: "Looking for an ERP system", addedBy: "System" }]
    },
    {
        name: "Priya Patel",
        phone: "8765432109",
        category: "Real Estate",
        type: "Luxury",
        status: "Contacted",
        priority: "Warm",
        source: "Facebook Ads"
    },
    {
        name: "Amit Desai",
        phone: "7654321098",
        category: "Healthcare",
        type: "Others",
        status: "Interested",
        priority: "Hot",
        source: "Referral",
        notes: [{ text: "Wants to see a demo next week", addedBy: "Sales" }]
    },
    {
        name: "Neha Gupta",
        phone: "6543210987",
        category: "Education",
        type: "Requirement",
        status: "Quotation Sent",
        priority: "Warm",
        source: "Google Search"
    },
    {
        name: "Vikram Singh",
        phone: "9988776655",
        category: "Automotive",
        type: "Others",
        status: "Converted",
        priority: "Cold",
        source: "Walk-in"
    },
    {
        name: "Anjali Verma",
        phone: "8877665544",
        category: "E-commerce",
        type: "Budget",
        status: "New",
        priority: "Warm",
        source: "LinkedIn"
    },
    {
        name: "Karan Johar",
        phone: "7766554433",
        category: "Entertainment",
        type: "Luxury",
        status: "Contacted",
        priority: "Hot",
        source: "Networking Event"
    },
    {
        name: "Sunil Shetty",
        phone: "6655443322",
        category: "Hospitality",
        type: "Others",
        status: "Lost",
        priority: "Cold",
        source: "Cold Call"
    }
];

const seedLeads = async () => {
    try {
        const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/fuerte_db';
        await mongoose.connect(MONGO_URI);
        console.log('✅ Connected to MongoDB');

        await Lead.insertMany(dummyLeads);
        console.log('🎉 Successfully inserted 8 dummy leads!');

        mongoose.connection.close();
    } catch (error) {
        console.error('❌ Error seeding leads:', error);
        process.exit(1);
    }
};

seedLeads();
