const express = require('express');
const router = express.Router();
const SystemConfig = require('../models/SystemConfig');
const Category = require('../models/Category');
const Product = require('../models/Product');
const Service = require('../models/Service');
const DiscoveryChip = require('../models/DiscoveryChip');

// Middleware to validate the secret token
const validateMasterToken = (req, res, next) => {
    const { token } = req.params;
    if (token !== process.env.MASTER_SECRET_TOKEN) {
        return res.status(404).send('<!DOCTYPE html><html><body style="background:#0f172a;color:#fff;display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif"><h1>404 Not Found</h1></body></html>');
    }
    next();
};

/**
 * GET /api/mc/:token/seed-categories
 */
router.get('/:token/seed-categories', validateMasterToken, async (req, res) => {
    const categories = [
        "Machine Tools", "Printing Machinery", "Motors, Gears & Drives",
        "Machine Tools Accessories", "Packaging Machinery",
        "Bolt / Nut / Fastener / Spring Manufacturers", "Robotic / Automation",
        "Cutting Tools", "Rubber Belt / V-Belt", "CNC / VMC / HMC Manufacturers",
        "Power Tools & Hand Tools", "Air Compressors", "Control Panels",
        "Material Handling & Construction", "Abrasives", "Welding Equipment",
        "Crane / Hoist / Chain Pulley Block", "Powder Coating Equipment / Materials",
        "Transformers", "Chain & Sprocket", "Lubricating Oil / Grease",
        "Laser Marking & Cutting", "Castor Wheel / Trolley Wheel",
        "Bank & Financial Institutions", "Industrial Safety",
        "Electrical & Electronics", "Currency Counting Machines",
        "Hydraulics Equipment", "Pneumatics Systems"
    ];

    const slugify = (text) => text.toString().toLowerCase().trim().replace(/\s+/g, '-').replace(/[^\w\-]+/g, '').replace(/\-\-+/g, '-');

    try {
        const operations = categories.map(name => ({
            updateOne: {
                filter: { name: name },
                update: { $setOnInsert: { name, slug: slugify(name), status: 'Active', subCount: 0 } },
                upsert: true
            }
        }));
        const result = await Category.bulkWrite(operations);
        res.json({ status: 'success', upserted: result.upsertedCount, matched: result.matchedCount });
    } catch (err) {
        res.status(500).json({ status: 'error', msg: err.message });
    }
});

/**
 * GET /api/mc/:token/enrich-categories
 * Action to add premium industrial images to 29 categories
 */
router.get('/:token/enrich-categories', validateMasterToken, async (req, res) => {
    const imageMap = {
        "Machine Tools": "/admin/categories/machine-tools.jpg",
        "Printing Machinery": "/admin/categories/printing-machinery.jpg",
        "Motors, Gears & Drives": "/admin/categories/motors-gears-drives.jpg",
        "Machine Tools Accessories": "/admin/categories/machine-tools-accessories.jpg",
        "Packaging Machinery": "/admin/categories/packaging-machinery.jpg",
        "Bolt / Nut / Fastener / Spring Manufacturers": "/admin/categories/bolt-nut-fastener-spring-manufacturers.jpg",
        "Robotic / Automation": "/admin/categories/robotic-automation.jpg",
        "Cutting Tools": "/admin/categories/cutting-tools.jpg",
        "Rubber Belt / V-Belt": "/admin/categories/rubber-belt-v-belt.jpg",
        "CNC / VMC / HMC Manufacturers": "/admin/categories/cnc-vmc-hmc-manufacturers.jpg",
        "Power Tools & Hand Tools": "/admin/categories/power-tools-hand-tools.jpg",
        "Air Compressors": "/admin/categories/air-compressors.jpg",
        "Control Panels": "/admin/categories/control-panels.jpg",
        "Material Handling & Construction": "/admin/categories/material-handling-construction.jpg",
        "Abrasives": "/admin/categories/abrasives.jpg",
        "Welding Equipment": "/admin/categories/welding-equipment.jpg",
        "Crane / Hoist / Chain Pulley Block": "/admin/categories/crane-hoist-chain-pulley-block.jpg",
        "Powder Coating Equipment / Materials": "/admin/categories/powder-coating-equipment-materials.jpg",
        "Transformers": "/admin/categories/transformers.jpg",
        "Chain & Sprocket": "/admin/categories/chain-sprocket.jpg",
        "Lubricating Oil / Grease": "/admin/categories/lubricating-oil-grease.jpg",
        "Laser Marking & Cutting": "/admin/categories/laser-marking-cutting.jpg",
        "Castor Wheel / Trolley Wheel": "/admin/categories/castor-wheel-trolley-wheel.jpg",
        "Bank & Financial Institutions": "/admin/categories/bank-financial-institutions.jpg",
        "Industrial Safety": "/admin/categories/industrial-safety.jpg",
        "Electrical & Electronics": "/admin/categories/electrical-electronics.jpg",
        "Currency Counting Machines": "/admin/categories/currency-counting-machines.jpg",
        "Hydraulics Equipment": "/admin/categories/hydraulics-equipment.jpg",
        "Pneumatics Systems": "/admin/categories/pneumatics-systems.jpg"
    };

    try {
        const operations = Object.entries(imageMap).map(([name, url]) => ({
            updateOne: {
                filter: { name: { $regex: new RegExp("^" + name.trim() + "$", "i") } },
                update: { $set: { image: url } }
            }
        }));
        const result = await Category.bulkWrite(operations);
        res.json({ 
            status: 'success', 
            modified: result.modifiedCount, 
            matched: result.matchedCount,
            totalCategoriesInMap: Object.keys(imageMap).length
        });
    } catch (err) {
        res.status(500).json({ status: 'error', msg: err.message });
    }
});

/**
 * GET /api/mc/public-stats
 * Public endpoint for search count
 */
router.get('/public-stats', async (req, res) => {
    try {
        const [pCount, sCount] = await Promise.all([
            Product.countDocuments(),
            Service.countDocuments()
        ]);
        res.json({ total: pCount + sCount });
    } catch (err) {
        res.status(500).json({ total: 0 });
    }
});

/**
 * GET /api/mc/public-discovery
 * Public endpoint for discovery chips
 */
router.get('/public-discovery', async (req, res) => {
    try {
        const chips = await DiscoveryChip.find({ isActive: true }).sort({ order: 1 });
        res.json(chips);
    } catch (err) {
        res.status(500).json([]);
    }
});

/**
 * GET /api/mc/:token
 */
router.get('/:token', validateMasterToken, async (req, res) => {
    try {
        const configs = await SystemConfig.find();
        const configMap = configs.reduce((acc, curr) => {
            acc[curr.panel] = curr;
            return acc;
        }, {});

        const featureMap = {
            admin: ['dashboard', 'users', 'listings', 'categories', 'products', 'services', 'reviews', 'leads', 'adminteam', 'roles', 'fraud', 'auditlogs', 'broadcasting', 'claims', 'discovery', 'locations', 'plans', 'coupons', 'overrides', 'faqs', 'settings', 'reports', 'cms', 'cmsdashboard', 'articlesblogs', 'staticpages', 'faqmanager', 'homebanners', 'seoblocks', 'medialibrary', 'revenue', 'revenuedashboard', 'transactions', 'refundqueue', 'invoices', 'gstreport', 'failedpayments', 'payouts', 'ads', 'addashboard', 'manageads', 'adslotconfig'],
            merchant: ['dashboard', 'analytics', 'leads', 'reviews', 'mybrands', 'categories', 'products', 'servicecatalogue', 'locations', 'promotionsads', 'offersdeals', 'plansbilling', 'notificationcenter'],
            frontend: ['home', 'search', 'categories', 'businessdetail', 'productdetail']
        };

        const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Master Control Panel</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
    <style>
        body { font-family: 'Inter', sans-serif; background-color: #0c111d; color: #f8fafc; }
        .glass { background: rgba(17, 24, 39, 0.7); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.05); }
        .toggle-track { background-color: #1f2937; transition: all 0.3s; }
        .toggle-checkbox:checked + .toggle-track { background-color: #4f46e5; box-shadow: 0 0 10px rgba(79, 70, 229, 0.3); }
        .toggle-checkbox:checked + .toggle-track .toggle-dot { transform: translateX(20px); }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.1); border-radius: 10px; }
    </style>
</head>
<body class="p-4 md:p-10 min-h-screen">
    <div id="toast-container" class="fixed top-5 right-5 z-50 flex flex-col gap-3"></div>

    <div class="max-w-7xl mx-auto">
        <header class="mb-10 flex flex-col md:flex-row justify-between items-center bg-slate-900/40 p-8 rounded-[2.5rem] border border-white/5 shadow-2xl relative overflow-hidden">
            <div class="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500"></div>
            <div>
                <h1 class="text-3xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">Master Control</h1>
                <p class="text-slate-500 text-xs font-bold mt-1 uppercase tracking-widest">Platform Core Systems</p>
            </div>
            <div class="mt-4 md:mt-0 flex flex-wrap items-center gap-4 justify-end">
                <button onclick="handleAction('seed-categories', 'SEEDING...', '29 CATEGORIES SEEDED', this)" class="bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-400 border border-emerald-500/20 px-6 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all">
                    ⚡ Seed Categories
                </button>
                <button onclick="handleAction('enrich-categories', 'ENRICHING...', 'VISUALS UPDATED', this)" class="bg-purple-600/10 hover:bg-purple-600/20 text-purple-400 border border-purple-500/20 px-6 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all">
                    🖼️ Enrich Visuals
                </button>
                <span class="px-4 py-2.5 bg-indigo-500/10 text-indigo-400 rounded-full text-[10px] font-black border border-indigo-500/20">MASTER AUTHORIZED</span>
            </div>
        </header>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
            ${['admin', 'merchant', 'frontend'].map(panel => {
                const config = configMap[panel] || { dbName: 'justdial', paginationLimit: 10, hiddenFeatures: [], isActive: true };
                return `
                <div class="glass p-8 rounded-[3rem] flex flex-col h-full shadow-2xl">
                    <div class="flex items-center justify-between mb-8">
                        <h2 class="text-2xl font-black capitalize text-white">${panel}</h2>
                        <div class="w-3 h-3 rounded-full ${config.isActive ? 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.5)]' : 'bg-slate-700'}"></div>
                    </div>

                    <div class="space-y-4 mb-8">
                        <div>
                            <label class="block text-slate-500 text-[10px] uppercase font-black tracking-widest mb-1.5 ml-1">Database</label>
                            <input type="text" id="${panel}-dbName" value="${config.dbName}" class="w-full bg-slate-900/60 border border-white/5 rounded-2xl px-5 py-3.5 text-sm focus:ring-2 focus:ring-indigo-500/50 outline-none text-indigo-300 font-mono">
                        </div>
                        <div>
                            <label class="block text-slate-500 text-[10px] uppercase font-black tracking-widest mb-1.5 ml-1">Pagination</label>
                            <input type="number" id="${panel}-paginationLimit" value="${config.paginationLimit}" class="w-full bg-slate-900/60 border border-white/5 rounded-2xl px-5 py-3.5 text-sm focus:ring-2 focus:ring-indigo-500/50 outline-none font-bold">
                        </div>
                    </div>

                    <div class="flex-1">
                        <label class="block text-slate-500 text-[10px] uppercase font-black tracking-widest mb-4 ml-1">Features (ON=Visible)</label>
                        <div class="max-h-[400px] overflow-y-auto pr-2 space-y-2 custom-scrollbar">
                            ${(featureMap[panel] || []).map(feature => {
                                const isHidden = config.hiddenFeatures.includes(feature);
                                return '<div class="flex items-center justify-between p-3.5 bg-white/[0.02] rounded-2xl border border-transparent hover:bg-white/[0.04] transition-all">' +
                                    '<span class="text-xs font-bold text-slate-400 capitalize">' + feature + '</span>' +
                                    '<label class="relative inline-flex items-center cursor-pointer">' +
                                        '<input type="checkbox" data-panel="' + panel + '" data-feature="' + feature + '" ' + (!isHidden ? 'checked' : '') + ' class="toggle-checkbox sr-only">' +
                                        '<div class="toggle-track w-11 h-6 rounded-full relative shadow-inner">' +
                                            '<div class="toggle-dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full shadow transition-all duration-300"></div>' +
                                        '</div>' +
                                    '</label>' +
                                '</div>';
                            }).join('')}
                        </div>
                    </div>

                    <button onclick="saveConfig('${panel}', this)" class="mt-8 w-full bg-indigo-600 hover:bg-indigo-500 text-white font-black py-5 rounded-[1.5rem] shadow-xl active:scale-[0.98] transition-all text-xs uppercase tracking-widest">
                        Apply Protocol
                    </button>
                </div>
                `;
            }).join('')}
        </div>
    </div>

    <script>
        function showToast(msg, type) {
            const container = document.getElementById('toast-container');
            const toast = document.createElement('div');
            toast.className = (type === 'success' ? 'bg-emerald-500' : 'bg-red-500') + ' text-white px-6 py-4 rounded-2xl shadow-2xl font-bold text-sm animate-bounce';
            toast.textContent = msg;
            container.appendChild(toast);
            setTimeout(() => toast.remove(), 3000);
        }

        async function handleAction(endpoint, loadingText, successMsg, btn) {
            const originalText = btn.textContent;
            btn.disabled = true;
            btn.textContent = loadingText;
            try {
                const res = await fetch(window.location.href + '/' + endpoint);
                const data = await res.json();
                if (data.status === 'success') {
                    showToast(successMsg, 'success');
                } else {
                    showToast('ACTION FAILED', 'error');
                }
            } catch (err) {
                showToast('API ERROR', 'error');
            } finally {
                btn.disabled = false;
                btn.textContent = originalText;
            }
        }

        async function saveConfig(panel, btn) {
            const originalText = btn.textContent;
            btn.disabled = true;
            btn.textContent = 'EXECUTING...';
            const dbName = document.getElementById(panel + '-dbName').value;
            const paginationLimit = parseInt(document.getElementById(panel + '-paginationLimit').value);
            const checkboxes = document.querySelectorAll('input[data-panel="' + panel + '"]');
            const hiddenFeatures = [];
            checkboxes.forEach(cb => { if (!cb.checked) hiddenFeatures.push(cb.getAttribute('data-feature')); });

            try {
                const res = await fetch(window.location.href, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ panel, dbName, paginationLimit, hiddenFeatures, isActive: true })
                });
                if (res.ok) {
                    showToast('CONFIG SAVED: ' + panel.toUpperCase(), 'success');
                    setTimeout(() => window.location.reload(), 1500);
                } else {
                    showToast('SAVE FAILED', 'error');
                    btn.disabled = false;
                    btn.textContent = originalText;
                }
            } catch (err) {
                showToast('API ERROR', 'error');
                btn.disabled = false;
                btn.textContent = originalText;
            }
        }
    </script>
</body>
</html>
        `;
        res.header('Content-Type', 'text/html');
        res.send(html);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

router.post('/:token', validateMasterToken, async (req, res) => {
    try {
        const { panel, ...updateData } = req.body;
        let config = await SystemConfig.findOneAndUpdate(
            { panel },
            { $set: { ...updateData, updatedAt: Date.now() } },
            { new: true, upsert: true }
        );
        res.json({ status: 'success', config });
    } catch (err) {
        res.status(500).json({ msg: err.message });
    }
});

module.exports = router;
