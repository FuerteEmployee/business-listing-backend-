const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
try {
    dns.setServers(['8.8.8.8', '8.8.4.4']);
} catch (e) {
    // Ignore if setServers is not supported in current context
}

const path = require('path');
const mongoose = require('mongoose');
// Load the backend's .env explicitly - this script is run from its own directory,
// where a bare dotenv.config() would look in the wrong place.
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const Review = require('../models/Review');
const User = require('../models/User');
const Company = require('../models/Company');

async function auditOrphanedReviews() {
    const isDryRun = !process.argv.includes('--apply');
    const mode = process.argv.find(arg => arg.startsWith('--action='))?.split('=')[1] || 'report';

    console.log(`=== AUDIT ORPHANED REVIEWS ===`);
    console.log(`Mode: ${isDryRun ? 'DRY-RUN (Pass --apply to make changes)' : 'LIVE APPLY'}`);
    console.log(`Action: ${mode}`);

    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!mongoUri) {
        console.error('ERROR: MONGO_URI is not set in process.env');
        process.exit(1);
    }

    try {
        await mongoose.connect(mongoUri);
        console.log('Connected to MongoDB.');

        const reviews = await Review.find({});
        console.log(`Total reviews in database: ${reviews.length}`);

        const userIds = [...new Set(reviews.map(r => r.userId?.toString()).filter(Boolean))];
        const businessIds = [...new Set(reviews.map(r => r.businessId?.toString()).filter(Boolean))];

        const existingUsers = new Set((await User.find({ _id: { $in: userIds } }).select('_id')).map(u => u._id.toString()));
        const existingCompanies = new Set((await Company.find({ _id: { $in: businessIds } }).select('_id')).map(c => c._id.toString()));

        let orphanedUserCount = 0;
        let orphanedBusinessCount = 0;
        const orphanedReviews = [];

        for (const review of reviews) {
            const hasUser = review.userId && existingUsers.has(review.userId.toString());
            const hasBusiness = review.businessId && existingCompanies.has(review.businessId.toString());

            if (!hasUser || !hasBusiness) {
                if (!hasUser) orphanedUserCount++;
                if (!hasBusiness) orphanedBusinessCount++;
                orphanedReviews.push({
                    reviewId: review._id,
                    missingUser: !hasUser,
                    missingBusiness: !hasBusiness,
                    userId: review.userId,
                    businessId: review.businessId,
                    comment: review.comment?.substring(0, 40)
                });
            }
        }

        console.log(`\nResults:`);
        console.log(`- Reviews missing valid User: ${orphanedUserCount}`);
        console.log(`- Reviews missing valid Business: ${orphanedBusinessCount}`);
        console.log(`- Total orphaned reviews: ${orphanedReviews.length}`);

        if (orphanedReviews.length > 0) {
            console.log(`\nSample orphaned reviews:`);
            console.table(orphanedReviews.slice(0, 10));
        }

        if (mode === 'soft-delete' && orphanedReviews.length > 0) {
            if (isDryRun) {
                console.log(`\n[DRY-RUN] Would mark ${orphanedReviews.length} reviews as isDeleted: true.`);
            } else {
                const idsToSoftDelete = orphanedReviews.map(r => r.reviewId);
                const res = await Review.updateMany(
                    { _id: { $in: idsToSoftDelete } },
                    { $set: { isDeleted: true, status: 'Rejected' } }
                );
                console.log(`\n[APPLIED] Soft-deleted ${res.modifiedCount} orphaned reviews.`);
            }
        }

    } catch (err) {
        console.error('Audit Error:', err);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB.');
    }
}

auditOrphanedReviews();
