const mongoose = require('mongoose');
const Category = require('./models/Category');
const Product = require('./models/Product');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/justdial';

async function check() {
    try {
        await mongoose.connect(MONGO_URI);
        
        const cat = await Category.findOne({ name: 'Electrical & Electronics' });
        console.log('Category "Electrical & Electronics" ID:', cat ? cat._id : 'Not found');
        
        const existingSku = await Product.findOne({ sku: '555' });
        console.log('Product with SKU 555:', existingSku ? `Found: ${existingSku.name}` : 'Not found');
        
        const existingSlug = await Product.findOne({ slug: 'test-product' });
        console.log('Product with slug "test-product":', existingSlug ? `Found: ${existingSlug.name}` : 'Not found');

        const allProducts = await Product.find().limit(5);
        console.log('Recently added products:', allProducts.map(p => p.sku));

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
check();
