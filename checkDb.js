const { MongoClient } = require('mongodb');

MongoClient.connect('mongodb://127.0.0.1:27017').then(async (client) => {
    const db = client.db('justdial');
    const companies = await db.collection('companies').find({}).project({ name: 1, slug: 1, status: 1 }).toArray();
    
    console.log(`\n=== COMPANIES (${companies.length} total) ===\n`);
    companies.forEach((c, i) => {
        console.log(`[${i + 1}] Name   : ${c.name}`);
        console.log(`    Slug   : ${JSON.stringify(c.slug)}`);
        console.log(`    Status : ${c.status}`);
        console.log('');
    });

    // Check specifically for fuerte-developers slug
    const fuerte = await db.collection('companies').findOne({ slug: 'fuerte-developers' });
    console.log('=== LOOKUP: slug="fuerte-developers" ===');
    console.log(fuerte ? `FOUND: ${fuerte.name} (status: ${fuerte.status})` : 'NOT FOUND IN DB');

    client.close();
});
