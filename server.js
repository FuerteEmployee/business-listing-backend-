const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
dns.setServers(['8.8.8.8', '8.8.4.4']);

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const { initReportScheduler } = require('./utils/reportScheduler');
const { injectSystemConfig } = require('./middleware/configMiddleware');
const app = express();

// Initialize internal schedulers
initReportScheduler();

console.log('🌍 NODE_ENV:', process.env.NODE_ENV);
console.log('🔑 JWT_SECRET loaded:', !!process.env.JWT_SECRET);

const allowedOrigins = [
    'http://localhost:3100',
    'http://127.0.0.1:3100',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:3000',
    'https://fuerte-dial.netlify.app',
    'https://trinetra2.fuertedevelopers.com',
    'https://engitech.fuertedevelopers.com',
    'https://listing.engitechexpo.com',  // ← add this
    'https://node.engitechexpo.com',     // ← add this
    'https://claude.ai'
];

app.use(cors({
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
            return callback(null, true);
        }
        if (allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error('Not allowed by CORS'));
    },
    credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'ok', message: 'API is running' });
});

// Secret Master Control Route
app.use('/api/mc', require('./routes/masterRoutes'));

app.use('/api/categories', injectSystemConfig('frontend'), require('./routes/categories'));
app.use('/api/companies', injectSystemConfig('frontend'), require('./routes/companies'));
app.use('/api/users', injectSystemConfig('frontend'), require('./routes/users'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/me', require('./routes/userProfile'));
app.use('/api/notifications', require('./routes/notifications'));

// --- Background Jobs (Digests, etc.) ---
// Schedule cron jobs
const { initCronTasks } = require('./utils/cronTasks');
initCronTasks();

app.use('/api/upload', require('./routes/upload'));
app.use('/api/locations', require('./routes/locationRoutes'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/sliders', require('./routes/sliders'));
app.use('/api/popular-searches', require('./routes/popularSearches'));
app.use('/api/products', require('./routes/products'));
app.use('/api/services', require('./routes/services'));
app.use('/api/brand-locations', require('./routes/brandLocations'));
app.use('/api/claims', require('./routes/claimRoutes'));
app.use('/api/leads', require('./routes/leads'));
app.use('/api/otp', require('./routes/otp'));
app.use('/api/reviews', require('./routes/reviews'));
app.use('/api/plans', require('./routes/plans'));
app.use('/api/coupons', require('./routes/coupons'));
app.use('/api/subscriptions', require('./routes/subscriptions'));
app.use('/api/offers', require('./routes/offers'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/tickets', require('./routes/tickets'));
app.use('/api/admin', injectSystemConfig('admin'), require('./routes/admin'));
app.use('/api/enquiries', injectSystemConfig('admin'), require('./routes/enquiries'));
app.use('/api/fraud', injectSystemConfig('admin'), require('./routes/fraud'));
app.use('/api/cms', require('./routes/cms'));
app.use('/api/merchant', injectSystemConfig('merchant'), require('./routes/merchant'));
app.use('/api/revenue',  require('./routes/revenue'));
app.use('/api/ads',      require('./routes/ads'));
app.use('/api/merchant-ads', require('./routes/merchantAds'));
app.use('/api/reports',  require('./routes/reports'));
app.use('/api/osm',      require('./routes/osm'));

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/fuerte_db';
const PORT = process.env.PORT || 5000;

mongoose.connect(MONGO_URI)
    .then(() => {
        console.log('✅ Connected to MongoDB');
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`🚀 Server running on port ${PORT}`);
        });
    })
    .catch((err) => {
        console.error('❌ Failed to connect to MongoDB:', err.message);
        process.exit(1);
    });