const axios = require('axios');

async function testLeadAssignmentFix() {
    const API_URL = 'http://localhost:4597/api';
    
    try {
        console.log('--- Testing Lead Assignment Fix ---');
        
        // 1. Login as Standard Admin
        console.log('\n1. Logging in as Standard Admin...');
        const loginRes = await axios.post(`${API_URL}/auth/login`, {
            email: 'admin.test@example.com',
            password: 'password123'
        });
        
        const token = loginRes.data.token;
        console.log('   ✅ Login successful. Role:', loginRes.data.user.role);
        
        const config = {
            headers: { Authorization: `Bearer ${token}` }
        };
        
        // 2. Fetch Users with role=Merchant
        console.log('\n2. Fetching users with role=Merchant...');
        const usersRes = await axios.get(`${API_URL}/users?role=Merchant`, config);
        
        if (usersRes.data.success && Array.isArray(usersRes.data.users)) {
            console.log(`   ✅ Success! Found ${usersRes.data.users.length} merchants.`);
            usersRes.data.users.forEach((u, i) => {
                console.log(`      [${i+1}] Name: ${u.name}, Role: ${u.role}`);
            });
        } else {
            console.log('   ❌ Failed to fetch merchants or data format incorrect.');
        }

    } catch (err) {
        console.error('   ❌ API Error:', err.response?.data?.msg || err.message);
    }
}

testLeadAssignmentFix();
