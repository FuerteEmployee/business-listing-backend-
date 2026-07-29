const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const Category = require('./models/Category');
const Company = require('./models/Company');
const User = require('./models/User');
const RBACRole = require('./models/RBACRole');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/justdial';

const categories = [
    { name: 'Restaurants', slug: 'restaurants', status: 'Active', subCount: 12 },
    { name: 'Hotels', slug: 'hotels', status: 'Active', subCount: 8 },
    { name: 'Hospitals', slug: 'hospitals', status: 'Active', subCount: 15 },
    { name: 'Education', slug: 'education', status: 'Active', subCount: 20 },
    { name: 'Real Estate', slug: 'real-estate', status: 'Active', subCount: 10 },
    { name: 'Salons & Spa', slug: 'salons-spa', status: 'Active', subCount: 7 },
    { name: 'Electronics', slug: 'electronics', status: 'Active', subCount: 18 },
    { name: 'Fitness', slug: 'fitness', status: 'Active', subCount: 5 },
    { name: 'Travel', slug: 'travel', status: 'Inactive', subCount: 3 },
    { name: 'Automobile', slug: 'automobile', status: 'Active', subCount: 9 },
];

const users = [
    { name: 'Super Admin', email: 'admin@gmail.com', role: 'Super Admin', status: 'Active', companiesOwned: 0 },
    { name: 'Super Admin 2', email: 'adminfuerte@gmail.com', role: 'Super Admin', status: 'Active', companiesOwned: 0 },
    { name: 'Trinetra Admin', email: 'admintrinerta@gmail.com', role: 'Super Admin', status: 'Active', companiesOwned: 0 },
    { name: 'Engitech Admin', email: 'adminengitech@gmail.com', role: 'Super Admin', status: 'Active', companiesOwned: 0 },
    { name: 'Standard Admin', email: 'admin.test@example.com', role: 'Admin', status: 'Active', companiesOwned: 0 },
    { name: 'Rahul Sharma', email: 'rahul@example.com', role: 'Company Owner', status: 'Active', companiesOwned: 3 },
    { name: 'Priya Patel', email: 'priya@example.com', role: 'Company Owner', status: 'Active', companiesOwned: 2 },
    { name: 'Amit Verma', email: 'amit@example.com', role: 'User', status: 'Active', companiesOwned: 0 },
    { name: 'Sneha Gupta', email: 'sneha@example.com', role: 'User', status: 'Active', companiesOwned: 0 },
    { name: 'Vijay Mehta', email: 'vijay@example.com', role: 'Company Owner', status: 'Suspended', companiesOwned: 1 },
    { 
        name: 'Merchant One', 
        email: 'merchant1@example.com', 
        role: 'Merchant', 
        status: 'Active', 
        companiesOwned: 1, 
        performanceScore: 85, 
        leadStats: { totalAssigned: 12, totalConverted: 4, avgResponseTime: 45 } 
    },
    { 
        name: 'Merchant Two', 
        email: 'merchant2@example.com', 
        role: 'Merchant', 
        status: 'Active', 
        companiesOwned: 2, 
        performanceScore: 92, 
        leadStats: { totalAssigned: 25, totalConverted: 10, avgResponseTime: 30 } 
    },
];

const companies = [
    { 
        name: 'Taj Hotel Mumbai', 
        slug: 'taj-hotel-mumbai',
        category: 'Hotels', 
        location: 'Mumbai, Maharashtra', 
        description: 'Luxury 5-star hotel in the heart of Mumbai', 
        status: 'Approved', 
        claimed: true, 
        verified: true,
        logo: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=200&h=200&fit=crop',
        image: 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=800&h=400&fit=crop'
    },
    { 
        name: 'Pizza Palace', 
        slug: 'pizza-palace',
        category: 'Restaurants', 
        location: 'Delhi, NCR', 
        description: 'Best pizza in town with 20+ varieties', 
        status: 'Approved', 
        claimed: true, 
        verified: false,
        logo: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=200&h=200&fit=crop',
        image: 'https://images.unsplash.com/photo-1574126154517-d1e0d89ef734?w=800&h=400&fit=crop'
    },
    { 
        name: 'Apollo Hospital', 
        slug: 'apollo-hospital',
        category: 'Hospitals', 
        location: 'Bangalore, Karnataka', 
        description: 'Multi-specialty hospital with 24/7 emergency', 
        status: 'Approved', 
        claimed: true, 
        verified: true,
        logo: 'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?w=200&h=200&fit=crop',
        image: 'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?w=800&h=400&fit=crop'
    },
    { 
        name: 'DLF Cyber City', 
        slug: 'dlf-cyber-city',
        category: 'Real Estate', 
        location: 'Gurugram, Haryana', 
        description: 'Premium commercial office space', 
        status: 'Approved', 
        claimed: false, 
        verified: false,
        logo: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=200&h=200&fit=crop',
        image: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=800&h=400&fit=crop'
    },
    { 
        name: 'Lakme Salon', 
        slug: 'lakme-salon',
        category: 'Salons & Spa', 
        location: 'Pune, Maharashtra', 
        description: 'Professional beauty salon and spa services', 
        status: 'Approved', 
        claimed: true, 
        verified: true,
        logo: 'https://images.unsplash.com/photo-1560066984-138dadb4c035?w=200&h=200&fit=crop',
        image: 'https://images.unsplash.com/photo-1560066984-138dadb4c035?w=800&h=400&fit=crop'
    },
    { 
        name: 'Sony Electronics', 
        slug: 'sony-electronics',
        category: 'Electronics', 
        location: 'Chennai, Tamil Nadu', 
        description: 'Authorized Sony showroom for all electronics', 
        status: 'Approved', 
        claimed: true, 
        verified: true,
        logo: 'https://images.unsplash.com/photo-1491933382434-500287f9b54b?w=200&h=200&fit=crop',
        image: 'https://images.unsplash.com/photo-1491933382434-500287f9b54b?w=800&h=400&fit=crop'
    },
    {
        name: 'Fresh Juice Bar',
        slug: 'fresh-juice-bar',
        category: 'Restaurants',
        location: 'Mumbai, Maharashtra',
        description: 'Freshly made organic juices and healthy snacks.',
        status: 'Approved',
        claimed: false,
        verified: true,
        logo: 'https://images.unsplash.com/photo-1600271886742-f049cd1f3f0f?w=200&h=200&fit=crop',
        image: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800&h=400&fit=crop'
    },
    {
        name: 'Tech Support Services',
        slug: 'tech-support',
        category: 'Electronics',
        location: 'Delhi, NCR',
        description: 'Professional IT support and computer repair services.',
        status: 'Approved',
        claimed: true,
        verified: true,
        logo: 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=200&h=200&fit=crop',
        image: 'https://images.unsplash.com/photo-1552664730-d307ca884978?w=800&h=400&fit=crop'
    },
    {
        name: 'Fitness Plus Gym',
        slug: 'fitness-plus',
        category: 'Fitness',
        location: 'Bangalore, Karnataka',
        description: 'Modern gym with state-of-the-art equipment and expert trainers.',
        status: 'Approved',
        claimed: false,
        verified: false,
        logo: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=200&h=200&fit=crop',
        image: 'https://images.unsplash.com/photo-1534367519231-ceac3dce4718?w=800&h=400&fit=crop'
    }
];

async function seed() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('✅ Connected to local MongoDB');

        // Clear existing data (but keep categories)
        await Company.deleteMany({});
        await User.deleteMany({});
        await RBACRole.deleteMany({});
        console.log('🗑️  Cleared existing data (Users, Companies, Roles)');

        // Insert new data
        const salt = await bcrypt.genSalt(10);
        const defaultPassword = await bcrypt.hash('password123', salt);
        const adminPassword = await bcrypt.hash('admin@123', salt);
        const trinetraPassword = await bcrypt.hash('trinetra123', salt);
        const engitechPassword = await bcrypt.hash('engitech123', salt);

        const usersWithPasswords = users.map(u => ({
            ...u,
            password:
                u.email === 'admintrinerta@gmail.com' ? trinetraPassword :
                u.email === 'adminengitech@gmail.com' ? engitechPassword :
                (u.email === 'admin@gmail.com' || u.email === 'adminfuerte@gmail.com') ? adminPassword : defaultPassword
        }));

        await User.insertMany(usersWithPasswords);
        console.log(`✅ Seeded ${users.length} users`);

        // Insert RBAC Roles
        const roles = Object.keys(RBACRole.defaultPermissions).map(name => ({
            name,
            description: `${name} default administrative role`,
            permissions: RBACRole.defaultPermissions[name],
            isBuiltIn: true
        }));
        await RBACRole.insertMany(roles);
        console.log(`✅ Seeded ${roles.length} administrative roles`);

        await Company.insertMany(companies);
        console.log(`✅ Seeded ${companies.length} companies`);

        console.log('\n🎉 Database seeded successfully!');
        process.exit(0);
    } catch (err) {
        console.error('❌ Seeding failed:', err.message);
        process.exit(1);
    }
}

seed();

