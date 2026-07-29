const mongoose = require('mongoose');
const slugify = require('slugify');

mongoose.connect('mongodb://127.0.0.1:27017/justdial').then(async () => {
    try {
        const db = mongoose.connection.db;

        // Catch ALL companies that have no slug, a null slug, or an empty slug
        const companies = await db.collection('companies').find({
            $or: [
                { slug: { $exists: false } },
                { slug: null },
                { slug: '' }
            ]
        }).toArray();

        console.log(`Found ${companies.length} companies without a valid slug.`);

        let updatedCount = 0;
        let skippedCount = 0;

        for (const company of companies) {
            if (!company.name) { skippedCount++; continue; }

            let slug = slugify(company.name, { lower: true, strict: true });

            // Handle slug collision: append short mongo _id suffix if slug already taken
            const existing = await db.collection('companies').findOne({ slug, _id: { $ne: company._id } });
            if (existing) {
                slug = `${slug}-${company._id.toString().slice(-4)}`;
            }

            await db.collection('companies').updateOne(
                { _id: company._id },
                { $set: { slug } }
            );
            console.log(`  → "${company.name}" → slug: "${slug}"`);
            updatedCount++;
        }

        console.log(`\n✅ Done. Updated: ${updatedCount}, Skipped (no name): ${skippedCount}`);
    } catch (err) {
        console.error('Error:', err);
    } finally {
        process.exit(0);
    }
});
