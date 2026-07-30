const mongoose = require('mongoose');
const User = require('./models/User');
const Company = require('./models/Company');
const Product = require('./models/Product');
const Category = require('./models/Category');
const { getProducts, getProduct, createProduct, updateProduct, deleteProduct } = require('./controllers/productController');
require('dotenv').config();

// Helper to mock response object
const mockResponse = () => {
    const res = {};
    res.status = (code) => {
        res.statusCode = code;
        return res;
    };
    res.json = (data) => {
        res.body = data;
        return res;
    };
    return res;
};

async function runSecurityTest() {
    console.log('🔄 Connecting to database...');
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/fuerte_db');
    console.log('✅ Connected to DB');

    // 1. Setup seed data
    console.log('🌱 Seeding test data for multi-tenancy check...');

    // Find or create test Category
    let category = await Category.findOne({ name: 'Test Category' });
    if (!category) {
        category = await Category.create({
            name: 'Test Category',
            slug: 'test-category-' + Date.now(),
            status: 'Active'
        });
    }

    // Create companies
    const companyA = await Company.create({
        name: 'Test Company A',
        slug: 'test-company-a-' + Date.now(),
        category: 'Test Category',
        status: 'Approved'
    });

    const companyB = await Company.create({
        name: 'Test Company B',
        slug: 'test-company-b-' + Date.now(),
        category: 'Test Category',
        status: 'Approved'
    });

    // Create owners
    const ownerA = await User.create({
        name: 'Owner A',
        email: `ownera-${Date.now()}@example.com`,
        password: 'password123',
        role: 'Brand Owner',
        company: companyA._id,
        companyId: companyA._id
    });

    const ownerB = await User.create({
        name: 'Owner B',
        email: `ownerb-${Date.now()}@example.com`,
        password: 'password123',
        role: 'Brand Owner',
        company: companyB._id,
        companyId: companyB._id
    });

    // Create Product owned by Company A
    const productA = await Product.create({
        name: 'Product A',
        slug: 'product-a-' + Date.now(),
        sku: 'SKU-A-' + Date.now(),
        price: 100,
        stock: 10,
        listingId: companyA._id,
        companyId: companyA._id,
        categoryId: category._id,
        status: 'Active'
    });

    console.log(`✅ Seeded:
  - Company A: ${companyA._id} (Owner A: ${ownerA.email})
  - Company B: ${companyB._id} (Owner B: ${ownerB.email})
  - Product A: ${productA.name} (${productA._id}) linked to Company A`);

    let passedTests = 0;
    let failedTests = 0;

    const assert = (condition, message) => {
        if (condition) {
            console.log(`  🟢 PASS: ${message}`);
            passedTests++;
        } else {
            console.log(`  🔴 FAIL: ${message}`);
            failedTests++;
        }
    };

    // ==================== TEST 1: GET /products isolation ====================
    console.log('\n🔍 Testing GET /products isolation...');
    
    // Request from Owner A
    const reqGetA = { user: ownerA, query: {} };
    const resGetA = mockResponse();
    await getProducts(reqGetA, resGetA);
    assert(
        resGetA.body && resGetA.body.success && resGetA.body.data.some(p => p._id.toString() === productA._id.toString()),
        "Owner A should retrieve Product A"
    );

    // Request from Owner B
    const reqGetB = { user: ownerB, query: {} };
    const resGetB = mockResponse();
    await getProducts(reqGetB, resGetB);
    assert(
        resGetB.body && resGetB.body.success && !resGetB.body.data.some(p => p._id.toString() === productA._id.toString()),
        "Owner B should NOT retrieve Product A"
    );

    // ==================== TEST 2: GET /products/:id (single fetch) isolation ====================
    console.log('\n🔍 Testing GET /products/:id single fetch isolation...');

    // Owner A fetches Product A
    const reqSingleA = { user: ownerA, params: { id: productA._id } };
    const resSingleA = mockResponse();
    await getProduct(reqSingleA, resSingleA);
    assert(
        resSingleA.body && resSingleA.body.success && resSingleA.body.data._id.toString() === productA._id.toString(),
        "Owner A should be allowed to fetch Product A details"
    );

    // Owner B fetches Product A
    const reqSingleB = { user: ownerB, params: { id: productA._id } };
    const resSingleB = mockResponse();
    await getProduct(reqSingleB, resSingleB);
    assert(
        resSingleB.statusCode === 403 && resSingleB.body.success === false && resSingleB.body.error.includes("Access Denied"),
        "Owner B should receive 403 Access Denied when fetching Product A details"
    );

    // ==================== TEST 3: POST /products auto-assignment ====================
    console.log('\n🔍 Testing POST /products tenant auto-assignment...');
    
    const reqPost = {
        user: ownerB,
        body: {
            name: 'Product B',
            price: 200,
            stock: 5,
            categoryId: category._id,
            sku: 'SKU-B-' + Date.now(),
            listingId: companyA._id // Maliciously try to assign to Company A
        }
    };
    const resPost = mockResponse();
    await createProduct(reqPost, resPost);
    
    const createdProductB = resPost.body && resPost.body.data;
    assert(
        resPost.body && resPost.body.success && createdProductB.companyId.toString() === companyB._id.toString() && createdProductB.listingId.toString() === companyB._id.toString(),
        "New product created by Owner B should automatically and securely bind to Company B, overriding fake inputs"
    );

    // ==================== TEST 4: PUT /products/:id isolation ====================
    console.log('\n🔍 Testing PUT /products/:id isolation...');

    // Owner B attempts to edit Product A
    const reqPutB = {
        user: ownerB,
        params: { id: productA._id },
        body: { name: 'Hacked Product A', price: 999 }
    };
    const resPutB = mockResponse();
    await updateProduct(reqPutB, resPutB);
    assert(
        resPutB.statusCode === 403 && resPutB.body.success === false,
        "Owner B should receive 403 Access Denied when trying to update Product A"
    );

    // Owner A edits Product A
    const reqPutA = {
        user: ownerA,
        params: { id: productA._id },
        body: { name: 'Updated Product A', price: 150 }
    };
    const resPutA = mockResponse();
    await updateProduct(reqPutA, resPutA);
    assert(
        resPutA.body && resPutA.body.success && resPutA.body.data.price === 150,
        "Owner A should be allowed to update Product A details"
    );

    // ==================== TEST 5: DELETE /products/:id isolation ====================
    console.log('\n🔍 Testing DELETE /products/:id isolation...');

    // Owner B attempts to delete Product A
    const reqDeleteB = { user: ownerB, params: { id: productA._id } };
    const resDeleteB = mockResponse();
    await deleteProduct(reqDeleteB, resDeleteB);
    assert(
        resDeleteB.statusCode === 403 && resDeleteB.body.success === false,
        "Owner B should receive 403 Access Denied when trying to delete Product A"
    );

    // Owner A deletes Product A
    const reqDeleteA = { user: ownerA, params: { id: productA._id } };
    const resDeleteA = mockResponse();
    await deleteProduct(reqDeleteA, resDeleteA);
    assert(
        resDeleteA.body && resDeleteA.body.success,
        "Owner A should be allowed to delete Product A"
    );

    // ==================== TEARDOWN ====================
    console.log('\n🧹 Cleaning up test documents...');
    await Product.deleteMany({ _id: { $in: [productA._id, createdProductB ? createdProductB._id : null].filter(Boolean) } });
    await User.deleteMany({ _id: { $in: [ownerA._id, ownerB._id] } });
    await Company.deleteMany({ _id: { $in: [companyA._id, companyB._id] } });
    console.log('✅ Teardown complete.');

    console.log('\n======================================');
    console.log(`🏁 TESTS COMPLETED: ${passedTests} PASSED, ${failedTests} FAILED`);
    console.log('======================================');

    process.exit(failedTests > 0 ? 1 : 0);
}

runSecurityTest().catch(err => {
    console.error('❌ Test execution failed:', err);
    process.exit(1);
});
