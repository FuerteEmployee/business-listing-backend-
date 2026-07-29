const mongoose = require('mongoose');
const User = require('./models/User');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/justdial';

async function check() {
    try {
        await mongoose.connect(MONGO_URI);
        const user = await User.findOne({ email: 'test@gmail.comm' });
        if (!user) {
            console.log('User not found');
            process.exit(1);
        }
        console.log(`User Role: "${user.role}" (Length: ${user.role.length})`);
        
        // Mocking authorize check
        const roles = ['Super Admin', 'Brand Owner', 'Company Owner'];
        console.log('Allowed roles:', roles);
        console.log('Is user role in allowed roles?', roles.includes(user.role));
        
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
check();
