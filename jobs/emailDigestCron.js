const cron = require('node-cron');
const User = require('../models/User');
const Lead = require('../models/Lead');
const Enquiry = require('../models/Enquiry');
const Company = require('../models/Company');
const sendEmail = require('../utils/email');

/**
 * Weekly Email Digest Job
 * Runs every Monday at 9:00 AM
 */
const initEmailDigestJob = () => {
    // '0 9 * * 1' -> 9:00 AM every Monday
    // For testing/demo purposes, we can use a more frequent schedule or manually trigger
    cron.schedule('0 9 * * 1', async () => {
        console.log('[CRON] Starting Weekly Email Digest Generation...');
        
        try {
            // 1. Find all users who want weekly digests
            const users = await User.find({
                'notificationPreferences.digestFrequency': 'Weekly',
                'notificationPreferences.email': true,
                status: 'Active'
            });

            console.log(`[CRON] Found ${users.length} users subscribed to weekly digests.`);

            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

            for (const user of users) {
                let digestContent = '';
                let hasActivity = false;

                // --- CASE A: Merchant/Admin (Leads & Enquiries for their businesses) ---
                if (['Merchant', 'Company Owner', 'Brand Owner', 'Super Admin'].includes(user.role)) {
                    // Find his businesses
                    const myBusinesses = await Company.find({ owner: user.id }).select('_id name');
                    const bizIds = myBusinesses.map(b => b._id);

                    // 1. New Leads
                    const newLeads = await Lead.find({
                        assignedTo: user.id,
                        createdAt: { $gte: sevenDaysAgo }
                    }).limit(10);

                    // 2. New Enquiries for his businesses
                    const newEnquiries = await Enquiry.find({
                        businessIds: { $in: bizIds },
                        status: 'Sent',
                        createdAt: { $gte: sevenDaysAgo }
                    }).limit(10);

                    if (newLeads.length > 0 || newEnquiries.length > 0) {
                        hasActivity = true;
                        digestContent += `<h2>Merchant Activity Summary</h2>`;
                        if (newLeads.length > 0) {
                            digestContent += `<p>You received <b>${newLeads.length}</b> new leads this week.</p>`;
                        }
                        if (newEnquiries.length > 0) {
                            digestContent += `<p>You have <b>${newEnquiries.length}</b> unread direct enquiries from customers.</p>`;
                        }
                        digestContent += `<p><a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/brand/leads">View All Leads in Dashboard</a></p><hr/>`;
                    }
                }

                // --- CASE B: Regular User (Replies to their enquiries) ---
                const myEnquiryResponses = await Enquiry.find({
                    userId: user.id,
                    'responses.respondedAt': { $gte: sevenDaysAgo }
                }).limit(5);

                if (myEnquiryResponses.length > 0) {
                    hasActivity = true;
                    digestContent += `<h2>Your Enquiry Updates</h2>`;
                    digestContent += `<p>You have received responses to <b>${myEnquiryResponses.length}</b> of your enquiries this week.</p>`;
                    digestContent += `<p><a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/profile/enquiries">View Replies</a></p><hr/>`;
                }

                // 3. Send Email if activity found
                if (hasActivity) {
                    try {
                        await sendEmail({
                            email: user.email,
                            subject: `Weekly Performance Digest - Engitech Expo`,
                            message: `Hello ${user.name}, you have new activity on your account. Check your dashboard for details.`,
                            html: `
                                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
                                    <h1 style="color: #4f46e5;">Weekly Digest</h1>
                                    <p>Hello <b>${user.name}</b>,</p>
                                    <p>Here is a summary of your activity on Engitech Expo for the past 7 days:</p>
                                    <div style="background: #f9fafb; padding: 20px; border-radius: 8px; border: 1px solid #e5e7eb;">
                                        ${digestContent}
                                    </div>
                                    <p style="font-size: 12px; color: #666; margin-top: 20px;">
                                        You received this email because you are subscribed to Weekly Digests. 
                                        You can change your preferences in <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/profile/notifications">Notification Settings</a>.
                                    </p>
                                </div>
                            `
                        });
                        
                        // Update last digest sent date
                        await User.findByIdAndUpdate(user.id, { 
                            'notificationPreferences.lastDigestSent': new Date() 
                        });
                        
                        console.log(`[CRON] Digest sent to ${user.email}`);
                    } catch (err) {
                        console.error(`[CRON] Failed to send email to ${user.email}:`, err.message);
                    }
                }
            }
            
            console.log('[CRON] Weekly Email Digest Job Completed.');
        } catch (err) {
            console.error('[CRON] Error in Email Digest Job:', err.message);
        }
    });
};

module.exports = initEmailDigestJob;
