const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Setting = require('./models/Setting');

dotenv.config();

async function checkSettings() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to DB');
        
        const count = await Setting.countDocuments();
        console.log(`Found ${count} settings documents`);
        
        const settings = await Setting.find();
        settings.forEach((s, i) => {
            console.log(`Document ${i}: ID=${s._id}, homepage=${JSON.stringify(s.homepage, null, 2).substring(0, 200)}...`);
            if (s.homepage && s.homepage.footerSections) {
              console.log(`  - footerSections count: ${s.homepage.footerSections.length}`);
            } else {
              console.log(`  - footerSections missing`);
            }
        });
        
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkSettings();
