
const mongoose = require('mongoose');
const slugify = require('slugify');
require('dotenv').config();

const Category = require('./models/Category');
const Country = require('./models/Country');
const State = require('./models/State');
const City = require('./models/City');
const Area = require('./models/Area');
const Company = require('./models/Company');

const brands = [
    {
        name: "Jyoti CNC Automation Ltd",
        category: "Machine Tools",
        country: "India",
        state: "Gujarat",
        city: "Rajkot",
        area: "Metoda GIDC",
        address: "Metoda Industrial Area, Rajkot",
        description: "Leading manufacturer of CNC machines including turning centers, machining centers and automation systems."
    },
    {
        name: "Macpower CNC Machines Ltd",
        category: "Machine Tools",
        country: "India",
        state: "Gujarat",
        city: "Rajkot",
        area: "Shapar Veraval",
        address: "Shapar Industrial Area, Rajkot",
        description: "Manufacturer of CNC turning centers, vertical machining centers and heavy-duty machine tools."
    },
    {
        name: "Yogi Machine Tools",
        category: "Machine Tools",
        country: "India",
        state: "Gujarat",
        city: "Rajkot",
        area: "Gondal Road",
        address: "Gondal Road Industrial Area, Rajkot",
        description: "Manufacturer and exporter of precision lathe machines and heavy-duty engineering machinery."
    },
    {
        name: "Rajkot Offset Machinery Co.",
        category: "Printing Machinery",
        country: "India",
        state: "Gujarat",
        city: "Rajkot",
        area: "Bhaktinagar",
        address: "Bhaktinagar Industrial Area",
        description: "Manufacturer of offset printing machinery and printing press equipment."
    },
    {
        name: "Synnova Gears & Transmissions Pvt Ltd",
        category: "Motors, Gears & Drives",
        country: "India",
        state: "Gujarat",
        city: "Rajkot",
        area: "Metoda GIDC",
        address: "Metoda Industrial Area",
        description: "Manufacturer of industrial gears, gearboxes and transmission components."
    },
    {
        name: "Tooltech Industries",
        category: "Machine Tools Accessories",
        country: "India",
        state: "Gujarat",
        city: "Rajkot",
        area: "Gondal Road",
        address: "Near ST Workshop, Gondal Road",
        description: "Manufacturer of machine tool accessories and spare parts."
    },
    {
        name: "Tinytech Plants",
        category: "Packaging Machinery",
        country: "India",
        state: "Gujarat",
        city: "Rajkot",
        area: "Kalawad Road",
        address: "Kalawad Road Industrial Zone",
        description: "Manufacturer of packaging machines, oil mill machinery and industrial processing equipment."
    },
    {
        name: "Patel Fasteners",
        category: "Bolt / Nut / Fastener Manufacturers",
        country: "India",
        state: "Gujarat",
        city: "Rajkot",
        area: "Aji GIDC",
        address: "Aji Industrial Area",
        description: "Manufacturer of industrial bolts, nuts and fasteners for machinery and automotive industries."
    },
    {
        name: "Vision Mechatronics",
        category: "Robotic / Automation",
        country: "India",
        state: "Gujarat",
        city: "Rajkot",
        area: "Metoda GIDC",
        address: "Metoda Industrial Estate",
        description: "Industrial automation company providing robotic integration and automation systems."
    },
    {
        name: "Argus Carbide Pvt Ltd",
        category: "Cutting Tools",
        country: "India",
        state: "Gujarat",
        city: "Rajkot",
        area: "Shapar",
        address: "Shapar Industrial Area",
        description: "Manufacturer of carbide cutting tools and precision tooling solutions."
    },
    {
        name: "J.K. Machine Tools (Gujarat) Pvt Ltd",
        category: "CNC / VMC / HMC Manufacturers",
        country: "India",
        state: "Gujarat",
        city: "Rajkot",
        area: "Shapar Veraval",
        address: "Shapar Industrial Area",
        description: "Manufacturer and exporter of CNC machines and industrial machining systems."
    },
    {
        name: "Aircomp Enterprise Gujarat",
        category: "Air Compressors",
        country: "India",
        state: "Gujarat",
        city: "Rajkot",
        area: "Metoda GIDC",
        address: "Metoda Industrial Estate",
        description: "Manufacturer and supplier of industrial air compressors and pneumatic equipment."
    },
    {
        name: "Balaji Hydro Tech",
        category: "Hydraulics Equipment",
        country: "India",
        state: "Gujarat",
        city: "Rajkot",
        area: "Aji GIDC",
        address: "Aji Industrial Estate",
        description: "Manufacturer of hydraulic cylinders, hydraulic presses and industrial hydraulic systems."
    },
    {
        name: "Prime Hydraulic & Engineers",
        category: "Pneumatics Systems",
        country: "India",
        state: "Gujarat",
        city: "Rajkot",
        area: "Shapar",
        address: "Shapar Industrial Area",
        description: "Supplier of pneumatic cylinders, air systems and industrial automation components."
    },
    {
        name: "Mokshi Abrasive Grinding Wheel",
        category: "Abrasives",
        country: "India",
        state: "Gujarat",
        city: "Rajkot",
        area: "Gondal Road",
        address: "Gondal Road Industrial Area",
        description: "Manufacturer of grinding wheels and abrasive tools for metal finishing."
    },
    {
        name: "Weldor Engineering Pvt Ltd",
        category: "Welding Equipment",
        country: "India",
        state: "Gujarat",
        city: "Rajkot",
        area: "Dhebar Road",
        address: "Dhebar Road Industrial Area",
        description: "Manufacturer of welding machines and industrial fabrication equipment."
    },
    {
        name: "Embicon Tech Hub",
        category: "Laser Marking & Cutting",
        country: "India",
        state: "Gujarat",
        city: "Rajkot",
        area: "Metoda",
        address: "Metoda Industrial Area",
        description: "Manufacturer of laser marking machines and automation equipment."
    },
    {
        name: "Neotech Electrical Control & Automation Pvt Ltd",
        category: "Electrical & Electronics",
        country: "India",
        state: "Gujarat",
        city: "Rajkot",
        area: "Metoda",
        address: "Metoda Industrial Estate",
        description: "Manufacturer of electrical control panels and industrial automation electronics."
    },
    {
        name: "Powergrow Electricals LLP",
        category: "Control Panels",
        country: "India",
        state: "Gujarat",
        city: "Rajkot",
        area: "Metoda",
        address: "Metoda GIDC",
        description: "Manufacturer of industrial control panels and electrical power distribution systems."
    },
    {
        name: "Lukeron Lubricants",
        category: "Lubricating Oil / Grease",
        country: "India",
        state: "Gujarat",
        city: "Rajkot",
        area: "Gondal Road",
        address: "Gondal Road Industrial Zone",
        description: "Manufacturer and distributor of industrial lubricants and greases."
    }
];

async function seed() {
    try {
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/justdial');
        console.log('Connected to MongoDB');

        for (const b of brands) {
            console.log(`Processing ${b.name}...`);

            // 1. Ensure Category exists
            let category = await Category.findOne({ name: b.category });
            if (!category) {
                category = await Category.create({
                    name: b.category,
                    slug: slugify(b.category, { lower: true, strict: true }),
                    status: 'Active'
                });
                console.log(`Created Category: ${b.category}`);
            }

            // 2. Ensure Location Hierarchy exists
            // Country
            let country = await Country.findOne({ name: b.country });
            if (!country) {
                country = await Country.create({
                    name: b.country,
                    code: b.country === 'India' ? 'IN' : b.country.substring(0, 2).toUpperCase(),
                    status: 'Active'
                });
                console.log(`Created Country: ${b.country}`);
            }

            // State
            let state = await State.findOne({ name: b.state, country_id: country._id });
            if (!state) {
                state = await State.create({
                    name: b.state,
                    country_id: country._id,
                    status: 'Active'
                });
                console.log(`Created State: ${b.state}`);
            }

            // City
            let city = await City.findOne({ name: b.city, state_id: state._id });
            if (!city) {
                city = await City.create({
                    name: b.city,
                    state_id: state._id,
                    slug: slugify(b.city, { lower: true, strict: true }),
                    status: 'Active'
                });
                console.log(`Created City: ${b.city}`);
            }

            // Area
            let area = await Area.findOne({ name: b.area, city_id: city._id });
            if (!area) {
                area = await Area.create({
                    name: b.area,
                    city_id: city._id,
                    slug: slugify(b.area, { lower: true, strict: true }),
                    status: 'Active'
                });
                console.log(`Created Area: ${b.area}`);
            }

            // 3. Create Company
            const companySlug = slugify(b.name, { lower: true, strict: true });
            let company = await Company.findOne({ slug: companySlug });

            const companyData = {
                name: b.name,
                slug: companySlug,
                category: b.category, // Stored as string in model
                country_id: country._id,
                state_id: state._id,
                city_id: city._id,
                area_id: area._id,
                address: b.address,
                description: b.description,
                status: 'Active',
                claimed: false, // Unclaimed status
                verified: true, // Mark as verified since it's admin added
                owner: null
            };

            if (!company) {
                await Company.create(companyData);
                console.log(`Created Company: ${b.name}`);
            } else {
                // Update existing if needed, but for now just skip
                console.log(`Company already exists: ${b.name}`);
            }
        }

        console.log('Seeding completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('Seeding error:', error);
        process.exit(1);
    }
}

seed();
