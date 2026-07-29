const mongoose = require('mongoose');
require('dotenv').config();
const Company = require('./models/Company');
const Category = require('./models/Category');
const Country = require('./models/Country');
const State = require('./models/State');
const City = require('./models/City');
const Area = require('./models/Area');

async function seedGujaratBusinesses() {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/justdial');
        console.log('✅ Connected to DB');

        // Get references
        const india = await Country.findOne({ code: 'IN' });
        const gujarat = await State.findOne({ name: 'Gujarat', country_id: india._id });
        const rajkot = await City.findOne({ name: 'Rajkot', state_id: gujarat._id });
        const ahmedabad = await City.findOne({ name: 'Ahmedabad', state_id: gujarat._id });
        const surat = await City.findOne({ name: 'Surat', state_id: gujarat._id });
        const aji = await Area.findOne({ name: 'Aji Industrial Area', city_id: rajkot._id });
        const shapar = await Area.findOne({ name: 'Shapar', city_id: rajkot._id });
        const cgroad = await Area.create({ name: 'C.G. Road', slug: 'cg-road', city_id: ahmedabad._id, pincode: '380009', status: 'Active' });
        const adajan = await Area.create({ name: 'Adajan', slug: 'adajan', city_id: surat._id, pincode: '395009', status: 'Active' });

        // Get categories
        const salonCat = await Category.findOne({ slug: 'salons-spa' });
        const restaurantCat = await Category.findOne({ slug: 'restaurants' });
        const electronicsCat = await Category.findOne({ slug: 'electronics' });
        const hospitalCat = await Category.findOne({ slug: 'hospitals' });
        const hotelsCat = await Category.findOne({ slug: 'hotels' });

        // Businesses
        const businesses = [
            // Rajkot
            {
                name: 'Rajkot Royal Hotel',
                slug: 'rajkot-royal-hotel',
                category: hotelsCat?._id,
                category_name: 'Hotels',
                country_id: india._id,
                state_id: gujarat._id,
                city_id: rajkot._id,
                area_id: aji?._id,
                description: 'Luxury hotel in the heart of Rajkot industrial area.',
                status: 'Active',
                claimed: true,
                verified: true,
                image: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=800&h=400&fit=crop',
                logo: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=200&h=200&fit=crop'
            },
            {
                name: 'Shapar Electronics',
                slug: 'shapar-electronics',
                category: electronicsCat?._id,
                category_name: 'Electronics',
                country_id: india._id,
                state_id: gujarat._id,
                city_id: rajkot._id,
                area_id: shapar?._id,
                description: 'Leading supplier of industrial electronics in Shapar.',
                status: 'Active',
                claimed: true,
                verified: false,
                image: 'https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=800&h=400&fit=crop',
                logo: 'https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=200&h=200&fit=crop'
            },
            // Ahmedabad
            {
                name: 'Ahmedabad Grand Salon',
                slug: 'ahmedabad-grand-salon',
                category: salonCat?._id,
                category_name: 'Salons & Spa',
                country_id: india._id,
                state_id: gujarat._id,
                city_id: ahmedabad._id,
                area_id: cgroad._id,
                description: 'Premium beauty and spa services on C.G. Road.',
                status: 'Active',
                claimed: true,
                verified: true,
                image: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=800&h=400&fit=crop',
                logo: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=200&h=200&fit=crop'
            },
            {
                name: 'C.G. Road Restaurant',
                slug: 'cg-road-restaurant',
                category: restaurantCat?._id,
                category_name: 'Restaurants',
                country_id: india._id,
                state_id: gujarat._id,
                city_id: ahmedabad._id,
                area_id: cgroad._id,
                description: 'Multi-cuisine restaurant popular for family dining.',
                status: 'Active',
                claimed: false,
                verified: true,
                image: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800&h=400&fit=crop',
                logo: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=200&h=200&fit=crop'
            },
            // Surat
            {
                name: 'Surat City Hospital',
                slug: 'surat-city-hospital',
                category: hospitalCat?._id,
                category_name: 'Hospitals',
                country_id: india._id,
                state_id: gujarat._id,
                city_id: surat._id,
                area_id: adajan._id,
                description: '24/7 multi-specialty hospital in Adajan.',
                status: 'Active',
                claimed: true,
                verified: true,
                image: 'https://images.unsplash.com/photo-1464983953574-0892a716854b?w=800&h=400&fit=crop',
                logo: 'https://images.unsplash.com/photo-1464983953574-0892a716854b?w=200&h=200&fit=crop'
            },
            {
                name: 'Adajan Veg Restaurant',
                slug: 'adajan-veg-restaurant',
                category: restaurantCat?._id,
                category_name: 'Restaurants',
                country_id: india._id,
                state_id: gujarat._id,
                city_id: surat._id,
                area_id: adajan._id,
                description: 'Pure veg restaurant famous for Gujarati thali.',
                status: 'Active',
                claimed: false,
                verified: true,
                image: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800&h=400&fit=crop',
                logo: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=200&h=200&fit=crop'
            }
        ];

        let created = 0;
        for (const b of businesses) {
            let exists = await Company.findOne({ slug: b.slug });
            if (!exists) {
                await Company.create({
                    name: b.name,
                    slug: b.slug,
                    category: b.category_name,
                    category_id: b.category,
                    country_id: b.country_id,
                    state_id: b.state_id,
                    city_id: b.city_id,
                    area_id: b.area_id,
                    description: b.description,
                    status: b.status,
                    claimed: b.claimed,
                    verified: b.verified,
                    image: b.image,
                    logo: b.logo
                });
                console.log(`🏢 Created business: ${b.name}`);
                created++;
            }
        }

        console.log(`\n🎉 Seeded ${created} businesses in Rajkot, Ahmedabad, and Surat!`);
        process.exit(0);
    } catch (err) {
        console.error('❌ Seeding error:', err);
        process.exit(1);
    }
}

seedGujaratBusinesses();
