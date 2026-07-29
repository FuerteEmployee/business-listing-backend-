const axios = require('axios');
require('dotenv').config();

const port = process.env.PORT || 5000;
const token = process.env.MASTER_SECRET_TOKEN;

async function seedConfig() {
    try {
        console.log('--- Seeding Admin Config ---');
        const adminRes = await axios.post(`http://localhost:${port}/api/mc/${token}`, {
            panel: 'admin',
            dbName: 'justdial',
            hiddenFeatures: ['fraud', 'leads'],
            isActive: true
        });
        console.log('Admin Config Result:', adminRes.data);

        console.log('\n--- Seeding Merchant Config ---');
        const merchantRes = await axios.post(`http://localhost:${port}/api/mc/${token}`, {
            panel: 'merchant',
            dbName: 'justdial',
            hiddenFeatures: ['leads'],
            isActive: true
        });
        console.log('Merchant Config Result:', merchantRes.data);

        console.log('\n--- Verifying Routing Protection ---');
        try {
            await axios.get(`http://localhost:${port}/api/fraud`);
        } catch (err) {
            console.log('Fraud Route Protection Status:', err.response?.status, err.response?.data?.msg);
        }

    } catch (err) {
        console.error('Error during seeding:', err.message);
        if (err.response) console.log('Response Detail:', err.response.data);
    }
}

seedConfig();
