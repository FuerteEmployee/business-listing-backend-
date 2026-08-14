/**
 * One-off backfill: populate Review.businessName / Review.authorName from the
 * still-live Company/User refs, for reviews written before those denormalized
 * fields existed.
 *
 * Reviews whose businessId/userId ref is ALREADY dangling (the business or
 * user was already hard-deleted) cannot have their name recovered — that
 * information no longer exists anywhere. Those rows are reported but left
 * untouched; they will keep rendering "Deleted Business" / "Deleted user"
 * going forward, which is the intended, honest behavior (see BUG_REPORT.md
 * #27 — "preserve + denormalize" option).
 *
 * Defaults to a dry run (reports what it would change, writes nothing).
 * Pass --apply to actually write the backfilled names.
 *
 *   node scripts/backfill-review-names.js          (dry run)
 *   node scripts/backfill-review-names.js --apply  (writes changes)
 */

const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const Review = require('../models/Review');
const Company = require('../models/Company');
const User = require('../models/User');

const APPLY = process.argv.includes('--apply');

async function main() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log(`Connected to MongoDB. Mode: ${APPLY ? 'APPLY (writing changes)' : 'DRY RUN (no writes)'}`);

    const reviews = await Review.find({
        $or: [{ businessName: null }, { authorName: null }]
    })
        .populate('businessId', 'name')
        .populate('userId', 'name');

    console.log(`Found ${reviews.length} review(s) missing businessName and/or authorName.`);

    let backfilledBusiness = 0;
    let backfilledAuthor = 0;
    let danglingBusiness = 0;
    let danglingAuthor = 0;

    for (const review of reviews) {
        let changed = false;

        if (!review.businessName) {
            if (review.businessId?.name) {
                review.businessName = review.businessId.name;
                backfilledBusiness++;
                changed = true;
            } else {
                danglingBusiness++;
                console.log(`  Review ${review._id}: businessId is dangling — cannot recover name, will show "Deleted Business".`);
            }
        }

        if (!review.authorName) {
            if (review.userId?.name) {
                review.authorName = review.userId.name;
                backfilledAuthor++;
                changed = true;
            } else {
                danglingAuthor++;
                console.log(`  Review ${review._id}: userId is dangling — cannot recover name, will show "Deleted user".`);
            }
        }

        if (changed && APPLY) {
            await review.save();
        }
    }

    console.log('\n--- Summary ---');
    console.log(`businessName backfilled: ${backfilledBusiness}`);
    console.log(`authorName backfilled:   ${backfilledAuthor}`);
    console.log(`Dangling businessId (unrecoverable): ${danglingBusiness}`);
    console.log(`Dangling userId (unrecoverable):      ${danglingAuthor}`);
    if (!APPLY) {
        console.log('\nDry run only — no changes were written. Re-run with --apply to write them.');
    }

    await mongoose.disconnect();
}

main().catch(err => {
    console.error('Backfill failed:', err);
    process.exit(1);
});
