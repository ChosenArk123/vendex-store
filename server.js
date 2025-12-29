require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');

// Models
const Product = require('./models/Product');
const Admin = require('./models/Admin');

// Libraries
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const session = require('express-session');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const csv = require('csv-parser');

const app = express();
const upload = multer({ dest: 'uploads/' });

// -----------------------------------------
// 1. CONFIGURATION & AUTH MIDDLEWARE
// -----------------------------------------
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { 
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        secure: process.env.NODE_ENV === 'production' 
    }
}));

app.use(passport.initialize());
app.use(passport.session());

passport.use(new LocalStrategy(async (username, password, done) => {
    try {
        const admin = await Admin.findOne({ username });
        if (!admin) return done(null, false, { message: 'Invalid credentials.' });
        const isMatch = await bcrypt.compare(password, admin.password);
        if (!isMatch) return done(null, false, { message: 'Invalid credentials.' });
        return done(null, admin);
    } catch (err) { return done(err); }
}));

passport.serializeUser((admin, done) => done(null, admin.id));
passport.deserializeUser(async (id, done) => {
    try {
        const admin = await Admin.findById(id);
        done(null, admin);
    } catch (err) { done(err); }
});

const checkAuth = (req, res, next) => {
    if (req.isAuthenticated()) return next();
    res.redirect('/login');
};

// -----------------------------------------
// 2. SHOPPER ROUTES (FRONTEND)
// -----------------------------------------

// Homepage with Search functionality
app.get('/', async (req, res) => {
    try {
        const searchQuery = req.query.search;
        let mongoQuery = {};
        if (searchQuery) {
            mongoQuery = {
                $or: [
                    { title: { $regex: searchQuery, $options: 'i' } },
                    { description: { $regex: searchQuery, $options: 'i' } },
                    { brand: { $regex: searchQuery, $options: 'i' } }
                ]
            };
        }
        const products = await Product.find(mongoQuery).lean();
        res.render('index', { products, searchQuery: searchQuery || '' });
    } catch (err) { res.status(500).send("Server Error"); }
});

// Product Detail
app.get('/product/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const product = await Product.findOne({ id: id }).lean();
        if (product) {
            res.render('product', { product, searchQuery: '' });
        } else {
            res.status(404).send('Product not found');
        }
    } catch (err) { res.status(500).send("Error"); }
});

// Google Shopping Feed (XML Generation)
app.get('/feed.xml', async (req, res) => {
    try {
        const products = await Product.find({}).lean();
        const siteUrl = `${req.protocol}://${req.get('host')}`;
        let xml = `<?xml version="1.0"?><rss xmlns:g="http://base.google.com/ns/1.0" version="2.0"><channel><title>Vendex Store</title><link>${siteUrl}</link><description>Premium Tech Store</description>`;
        products.forEach(p => {
            xml += `<item><g:id>${p.sku || p.id}</g:id><g:title><![CDATA[${p.title}]]></g:title><g:price>${p.price.toFixed(2)} USD</g:price><g:link>${siteUrl}/product/${p.id}</g:link><g:image_link>${p.image}</g:image_link><g:availability>${p.availability || 'in_stock'}</g:availability><g:brand>${p.brand || 'Vendex'}</g:brand></item>`;
        });
        xml += `</channel></rss>`;
        res.header('Content-Type', 'text/xml').send(xml);
    } catch (err) { res.status(500).send('Feed Error'); }
});

// Stripe Checkout
app.post('/create-checkout-session', async (req, res) => {
    try {
        const { cart } = req.body;
        const lineItems = cart.map(item => ({
            price_data: {
                currency: 'usd',
                product_data: { name: item.title, images: [item.image] },
                unit_amount: Math.round(item.price * 100), 
            },
            quantity: item.quantity,
        }));
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: lineItems,
            mode: 'payment',
            success_url: `${req.protocol}://${req.get('host')}/success`,
            cancel_url: `${req.protocol}://${req.get('host')}/cancel`,
        });
        res.json({ url: session.url });
    } catch (err) { res.status(500).json({ error: 'Checkout failed' }); }
});

app.get('/success', (req, res) => res.render('success'));
app.get('/cancel', (req, res) => res.render('cancel'));

// -----------------------------------------
// 3. ADMIN & INTELLIGENCE ROUTES
// -----------------------------------------

app.get('/login', (req, res) => res.render('login', { error: null }));
app.post('/login', passport.authenticate('local', { successRedirect: '/admin', failureRedirect: '/login' }));
app.get('/logout', (req, res) => req.logout((err) => res.redirect('/')));

app.get('/admin', checkAuth, async (req, res) => {
    try {
        const products = await Product.find({}).lean();
        const stats = {
            totalProducts: products.length,
            syncedCount: products.filter(p => p.custom_label_0).length,
            avgSpread: 0
        };

        let totalSpread = 0, spreadCount = 0;
        products.forEach(p => {
            if (p.custom_label_0) {
                const spread = ((p.price - parseFloat(p.custom_label_0)) / parseFloat(p.custom_label_0)) * 100;
                p.current_spread = spread.toFixed(1);
                totalSpread += spread;
                spreadCount++;
            }
        });
        stats.avgSpread = spreadCount > 0 ? (totalSpread / spreadCount).toFixed(1) : 0;
        res.render('admin', { products, stats });
    } catch (err) { res.status(500).send("Admin Load Error"); }
});

// --- DYNAMIC PATH LOGIC (Critical for Render vs Local) ---
app.post('/admin/sync-now', checkAuth, (req, res) => {
    const isProd = process.env.NODE_ENV === 'production';
    
    // Command selection
    const pythonCmd = isProd ? 'python3' : '/Users/aniparuc/MyNodeShop/venv/bin/python3';
    
    // Script path selection
    const scriptPath = isProd 
        ? path.join(__dirname, 'services', 'intelligence', 'watcher.py')
        : '/Users/aniparuc/MyNodeShop/services/intelligence/watcher.py';

    console.log(`🚀 Manual Sync Initiated. Running: ${pythonCmd} ${scriptPath}`);

    exec(`${pythonCmd} ${scriptPath}`, (error, stdout, stderr) => {
        if (error) {
            console.error(`Exec Error: ${error}`);
            return res.status(500).json({ success: false, error: stderr });
        }
        console.log(`Watcher Output: ${stdout}`);
        res.json({ success: true, message: "Market data refreshed!" });
    });
});

app.post('/admin/update-price', checkAuth, async (req, res) => {
    await Product.findOneAndUpdate({ id: req.body.productId }, { price: parseFloat(req.body.newPrice) });
    res.json({ success: true });
});

app.post('/admin/update-cost', checkAuth, async (req, res) => {
    await Product.findOneAndUpdate({ id: req.body.productId }, { cost: parseFloat(req.body.newCost) });
    res.json({ success: true });
});

// -----------------------------------------
// 4. BULK CSV IMPORT ENGINE
// -----------------------------------------
app.post('/admin/bulk-import', checkAuth, upload.single('productCsv'), (req, res) => {
    const results = [];
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    fs.createReadStream(req.file.path)
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', async () => {
            for (const row of results) {
                try {
                    await Product.findOneAndUpdate(
                        { sku: row.sku },
                        { 
                            id: parseInt(row.id), 
                            title: row.title, 
                            description: row.description,
                            price: parseFloat(row.price), 
                            cost: parseFloat(row.cost || 0),
                            image: row.image,
                            gtin: row.gtin,
                            category: row.category,
                            availability: 'in_stock'
                        },
                        { upsert: true }
                    );
                } catch (e) { console.error("Row import error", e); }
            }
            fs.unlinkSync(req.file.path); // Delete temp file
            res.json({ success: true, message: `Successfully imported ${results.length} products.` });
        });
});

// -----------------------------------------
// 5. SERVER STARTUP
// -----------------------------------------
const startServer = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ MongoDB Connected');
        const PORT = process.env.PORT || 3000;
        app.listen(PORT, () => console.log(`🚀 Vendex Intelligence Live on Port ${PORT}`));
    } catch (err) {
        console.error('❌ Startup Error:', err.message);
        process.exit(1);
    }
};

startServer();