const axios = require('axios');

async function testAdminFiltering() {
    const API_URL = 'http://localhost:4597/api/admin';
    
    try {
        console.log('--- Testing Admin Filtering Fix ---');
        
        // 1. Login as Super Admin
        console.log('\n1. Logging in as Super Admin...');
        const loginRes = await axios.post('http://localhost:4597/api/auth/login', {
            email: 'admin@gmail.com',
            password: 'admin@123'
        });
        
        const token = loginRes.data.token;
        const config = { headers: { Authorization: `Bearer ${token}` }};
        
        // 2. Fetch with roleType=admin
        console.log('\n2. Fetching with roleType=admin (Expected: Only admins)...');
        const adminRes = await axios.get(`${API_URL}/users?roleType=admin`, config);
        const adminUsers = adminRes.data.users;
        
        const nonAdmins = adminUsers.filter(u => !['Super Admin', 'Admin', 'Moderator'].includes(u.role));
        console.log(`   Fetched ${adminUsers.length} users.`);
        if (nonAdmins.length === 0) {
            console.log('   ✅ Success: No regular users or merchants found in admin list.');
        } else {
            console.log('   ❌ Error: Found non-admin accounts in admin list:', nonAdmins.map(u => u.name));
        }

        // 3. Fetch without roleType
        console.log('\n3. Fetching without roleType (Expected: All users)...');
        const allRes = await axios.get(`${API_URL}/users`, config);
        const allUsers = allRes.data.users;
        
        const containsRegularUsers = allUsers.some(u => u.role === 'User');
        const containsMerchants = allUsers.some(u => u.role === 'Merchant');
        
        console.log(`   Fetched ${allUsers.length} users total.`);
        if (containsRegularUsers && containsMerchants) {
            console.log('   ✅ Success: General user list contains both regular users and merchants.');
        } else {
            console.log('   ❌ Error: General user list is missing regular users or merchants.');
        }

    } catch (err) {
        console.error('   ❌ Error:', err.response?.data?.msg || err.message);
    }
}

testAdminFiltering();
