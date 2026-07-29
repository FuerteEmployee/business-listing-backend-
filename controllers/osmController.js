const axios = require('axios');

// Overpass API endpoints (uses multiple for load balancing)
const OVERPASS_SERVERS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];

// Nominatim for geocoding (city name → lat/lng)
const NOMINATIM = "https://nominatim.openstreetmap.org";

// OSM amenity/shop tag → human readable category map
const CATEGORY_MAP = {
    // Food & Drink
    restaurant: "Restaurant", cafe: "Cafe", fast_food: "Fast Food",
    bar: "Bar", pub: "Pub", bakery: "Bakery", ice_cream: "Ice Cream",
    food_court: "Food Court", sweet_shop: "Sweet Shop",
    // Health
    hospital: "Hospital", clinic: "Clinic", pharmacy: "Pharmacy",
    doctors: "Doctor", dentist: "Dentist", veterinary: "Veterinary",
    // Finance
    bank: "Bank", atm: "ATM", bureau_de_change: "Currency Exchange",
    // Education
    school: "School", college: "College", university: "University",
    library: "Library", kindergarten: "Kindergarten",
    // Shopping
    supermarket: "Supermarket", convenience: "Convenience Store",
    clothes: "Clothing Store", electronics: "Electronics", 
    mobile_phone: "Mobile Shop", hardware: "Hardware Store",
    jewellery: "Jewellery", furniture: "Furniture", books: "Bookstore",
    // Services
    hotel: "Hotel", guest_house: "Guest House", hostel: "Hostel",
    beauty: "Beauty Salon", hairdresser: "Hair Salon", laundry: "Laundry",
    car_repair: "Car Repair", fuel: "Petrol Station",
    // Entertainment
    cinema: "Cinema", theatre: "Theatre", gym: "Gym",
    // Transport
    bus_station: "Bus Station", taxi: "Taxi Stand",
    // Government
    post_office: "Post Office", police: "Police Station",
    fire_station: "Fire Station", townhall: "Town Hall",
};

const CATEGORY_EMOJI = {
    restaurant:"🍽️", cafe:"☕", fast_food:"🍔", bar:"🍸", pub:"🍺",
    bakery:"🥖", ice_cream:"🍦", hospital:"🏥", clinic:"🏥", pharmacy:"💊",
    doctors:"👨‍⚕️", dentist:"🦷", bank:"🏦", atm:"💳", school:"🎓",
    college:"🎓", university:"🎓", library:"📚", supermarket:"🛒",
    convenience:"🏪", clothes:"👗", electronics:"💻", mobile_phone:"📱",
    hotel:"🏨", guest_house:"🏨", beauty:"💅", hairdresser:"✂️",
    gym:"💪", cinema:"🎬", fuel:"⛽", car_repair:"🔧",
    bus_station:"🚌", post_office:"📮", police:"🚔", jewellery:"💍",
};

// Helper: geocode city name → {lat, lng, display_name}
async function geocodeCity(cityName) {
    const resp = await axios.get(`${NOMINATIM}/search`, {
        params: { q: cityName, format: "json", limit: 1 },
        headers: { "User-Agent": "EngiTech-Listing-Platform/1.0" },
    });
    if (!resp.data?.length) {
        console.warn(`ΓÜá City geocoding failed for: ${cityName}`);
        throw new Error(`City not found: ${cityName}. Please try a more specific address.`);
    }
    const { lat, lon, display_name } = resp.data[0];
    console.log(`Γ£à Geocoded ${cityName} to ${lat}, ${lon}`);
    return { lat: parseFloat(lat), lng: parseFloat(lon), display_name };
}

// Helper: build Overpass QL query
function buildQuery({ lat, lng, radius, category }) {
    let tagFilter = "";
    if (category) {
        const shopTypes = ["supermarket","convenience","clothes","electronics",
            "mobile_phone","hardware","jewellery","furniture","books",
            "bakery","hairdresser","beauty","laundry","car_repair","sweet_shop"];
        if (shopTypes.includes(category)) {
            tagFilter = `["shop"="${category}"]`;
        } else {
            tagFilter = `["amenity"="${category}"]`;
        }
    } else {
        tagFilter = `["name"]["amenity"]`;
    }

    return `
        [out:json][timeout:30];
        (
            node${tagFilter}(around:${radius},${lat},${lng});
            way${tagFilter}(around:${radius},${lat},${lng});
        );
        out center tags;
    `.trim();
}

// Helper: parse OSM element → clean business object
function parseElement(el) {
    const t = el.tags || {};
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;

    const addressParts = [
        t["addr:housenumber"],
        t["addr:street"],
        t["addr:suburb"] || t["addr:quarter"],
        t["addr:city"],
        t["addr:state"],
        t["addr:postcode"],
    ].filter(Boolean);

    const amenity = t.amenity || t.shop || t.tourism || t.leisure || "";
    const category = CATEGORY_MAP[amenity] || amenity.replace(/_/g, " ") || "Business";
    const emoji = CATEGORY_EMOJI[amenity] || "🏢";

    const rawHours = t.opening_hours || "";
    const hours = rawHours ? rawHours.split(";").map(h => h.trim()) : [];

    return {
        id: `${el.type}/${el.id}`,
        osmId: el.id,
        osmType: el.type,
        name: t.name || t["name:en"] || "Unnamed Business",
        category,
        emoji,
        amenityTag: amenity,
        address: addressParts.join(", ") || t["addr:full"] || "",
        phone: t.phone || t["contact:phone"] || null,
        email: t.email || t["contact:email"] || null,
        website: t.website || t["contact:website"] || null,
        openingHours: hours,
        lat,
        lng,
        tags: t,
        osmUrl: `https://www.openstreetmap.org/${el.type}/${el.id}`,
    };
}

// Helper: run Overpass query with failover
async function runOverpassQuery(query) {
    for (const server of OVERPASS_SERVERS) {
        try {
            const resp = await axios.post(server, `data=${encodeURIComponent(query)}`, {
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                timeout: 35000,
            });
            return resp.data;
        } catch (err) {
            const errorInfo = {
                status: err.response?.status,
                statusText: err.response?.statusText,
                url: server,
                message: err.message
            };
            console.error(`Γ¥î Overpass server failed:`, errorInfo);
            
            if (err.response?.status === 429) {
                console.warn(`ΓÜá Rate limited by ${server}. Moving to next...`);
            }
        }
    }
    throw new Error("The OpenStreetMap discovery engine is currently congested. Please try a smaller radius or try again in a few minutes.");
}

// ROUTE 1: Search businesses by city + optional category
exports.searchOSM = async (req, res) => {
    const { city = "Rajkot, Gujarat, India", category = "", radius = 5000, limit = 50 } = req.query;

    try {
        const { lat, lng, display_name } = await geocodeCity(city);
        const query = buildQuery({ lat, lng, radius: parseInt(radius), category });
        const data = await runOverpassQuery(query);

        const elements = (data.elements || [])
            .filter(el => el.tags?.name)
            .map(parseElement)
            .filter(b => b.lat && b.lng)
            .slice(0, parseInt(limit));

        res.json({
            success: true,
            count: elements.length,
            city: display_name,
            center: { lat, lng },
            radius: parseInt(radius),
            data: elements,
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
};

// ROUTE 2: Available categories list
exports.getCategories = (req, res) => {
    const categories = Object.entries(CATEGORY_MAP).map(([tag, label]) => ({
        tag,
        label,
        emoji: CATEGORY_EMOJI[tag] || "🏢",
    }));
    res.json({ success: true, data: categories });
};
