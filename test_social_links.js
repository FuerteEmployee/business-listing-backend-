const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const Setting = require('./models/Setting');

async function testSocialLinks() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        let settings = await Setting.findOne();
        console.log('BEFORE - socialLinks:', JSON.stringify(settings.homepage.socialLinks, null, 2));

        // Simulate exactly what the controller does with the new code
        const hp = {
            socialLinks: [
                { platform: 'Instagram', url: 'https://www.instagram.com/engitechexpo_/', icon: 'Instagram' },
                { platform: 'Facebook', url: '', icon: 'Facebook' },
                { platform: 'Linkedin', url: '', icon: 'Linkedin' },
                { platform: 'Youtube', url: '', icon: 'Youtube' }
            ]
        };

        console.log('Setting socialLinks to:', JSON.stringify(hp.socialLinks, null, 2));
        
        settings.homepage.socialLinks = hp.socialLinks;
        settings.markModified('homepage.socialLinks');
        settings.markModified('homepage');

        await settings.save();
        console.log('Saved!');

        // Now re-fetch to verify
        const fresh = await Setting.findOne();
        console.log('AFTER - socialLinks:', JSON.stringify(fresh.homepage.socialLinks, null, 2));
        console.log('AFTER - socialLinks count:', fresh.homepage.socialLinks.length);

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
        await mongoose.disconnect();
    }
}

testSocialLinks();
