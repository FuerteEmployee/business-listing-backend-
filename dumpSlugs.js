const { MongoClient } = require('mongodb');
MongoClient.connect('mongodb://127.0.0.1:27017').then(async (client) => {
    const db = client.db('justdial');
    const companies = await db.collection('companies').find({}).project({ name: 1, slug: 1, status: 1 }).toArray();
    console.log(`TOTAL_COMPANIES: ${companies.length}`);
    companies.forEach(c => {
        console.log(`NAME: ${c.name} | SLUG: ${c.slug} | STATUS: ${c.status}`);
    });
    client.close();
});
