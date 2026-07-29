const Company = require('../models/Company');
const mongoose = require('mongoose');
const City = require('../models/City');

// @desc    Get popular searches (categories) based on city
// @route   GET /api/popular-searches
const getPopularSearches = async (req, res) => {
    try {
        const { city } = req.query;
        let cityName = 'Your City';

        if (city && mongoose.Types.ObjectId.isValid(city)) {
            const cityDoc = await City.findById(city);
            if (cityDoc) {
                cityName = cityDoc.name;
            }
            
            // Aggregate companies active in this city, group by category
            const popularCategories = await Company.aggregate([
                { 
                    $match: { 
                        status: 'Active',
                        city_id: new mongoose.Types.ObjectId(city) 
                    } 
                },
                {
                    $group: {
                        _id: '$category',
                        count: { $sum: 1 }
                    }
                },
                { $sort: { count: -1 } },
                { $limit: 8 }
            ]);

            if (popularCategories.length > 0) {
                const formattedSearches = popularCategories.map(cat => ({
                    title: `${cat._id} in ${cityName}`,
                    query: cat._id,
                    count: cat.count
                }));
                
                return res.json({
                    success: true,
                    data: formattedSearches
                });
            }
        }

        // Default fallback if no city is provided or no data found for the city
        const defaultSearches = [
            { title: `Restaurants in ${cityName}`, query: 'Restaurants' },
            { title: `Salon in ${cityName}`, query: 'Salon' },
            { title: `Doctors in ${cityName}`, query: 'Doctors' },
            { title: `Hotels in ${cityName}`, query: 'Hotels' },
            { title: `Plumbers in ${cityName}`, query: 'Plumbers' },
            { title: `Car Repair in ${cityName}`, query: 'Car Repair' },
            { title: `Electricians in ${cityName}`, query: 'Electricians' },
            { title: `Gyms in ${cityName}`, query: 'Gyms' },
        ];

        res.json({
            success: true,
            data: defaultSearches
        });

    } catch (err) {
        console.error('Error fetching popular searches:', err);
        res.status(500).json({ success: false, msg: 'Server Error', data: [] });
    }
};

module.exports = { getPopularSearches };
