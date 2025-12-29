require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const { exec } = require('child_process'); // For triggering Python scripts
const Product = require('./models/Product');
const Admin = require('./models/Admin');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Auth Dependencies
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const session = require('express-session');
const bcrypt = require('bcryptjs');

const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const upload = multer({ dest: 'uploads/' }); // Temporary storage for uploaded files
const app = express();

// -----------------------------------------
// 1. CONFIGURATION & MIDDLEWARE
// -----------------------------------------
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: false })); // Required for Login Form POST

// Session Configuration (Commercial Standard)
app.use(session({
    secret: process.env.SESSION_SECRET || 'vendex_intelligence_secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 24 * 60 * 60 * 1000, // 24 Hours
        secure: process.env.NODE_ENV === 'production' // Only send over HTTPS in production
    }
}));

// -----------------------------------------
// 2. PASSPORT AUTHENTICATION SETUP
// -----------------------------------------
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

// Middleware to protect private routes
const checkAuth = (req, res, next) => {
    if (req.isAuthenticated()) return next();
    res.redirect('/login');
};

// -----------------------------------------
// 3. PUBLIC ROUTES (SHOPPER FACING)
// -----------------------------------------

// Homepage
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
    } catch (error) {
        res.status(500).send("Error loading products");
    }
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
    } catch (error) {
        res.status(500).send("Error loading product");
    }
});

// Google Shopping Feed (Business Automation)
app.get('/feed.xml', async (req, res) => {
    try {
        const products = await Product.find({}).lean();
        const siteUrl = `${req.protocol}://${req.get('host')}`;

        let xml = `<?xml version="1.0"?>
<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">
<channel>
<title>Vendex Store</title>
<link>${siteUrl}</link>
<description>Premium Tech Store</description>`;

        products.forEach(p => {
            xml += `
<item>
    <g:id>${p.sku || p.id}</g:id>
    <g:title><![CDATA[${p.title}]]></g:title>
    <g:price>${p.price.toFixed(2)} USD</g:price>
    <g:link>${siteUrl}/product/${p.id}</g:link>
    <g:image_link>${p.image}</g:image_link>
    <g:availability>${p.availability || 'in_stock'}</g:availability>
    <g:brand>${p.brand || 'Vendex'}</g:brand>
    ${p.gtin ? `<g:gtin>${p.gtin}</g:gtin>` : ''}
</item>`;
        });

        xml += `</channel></rss>`;
        res.header('Content-Type', 'text/xml');
        res.send(xml);
    } catch (err) {
        res.status(500).send('Error generating feed');
    }
});

// -----------------------------------------
// 4. CHECKOUT & STRIPE
// -----------------------------------------
app.post('/create-checkout-session', async (req, res) => {
    try {
        const { cart } = req.body;
        if (!cart || cart.length === 0) return res.status(400).json({ error: 'Cart empty' });

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
    } catch (error) {
        res.status(500).json({ error: 'Checkout failed' });
    }
});

app.get('/success', (req, res) => res.render('success'));
app.get('/cancel', (req, res) => res.render('cancel'));

// -----------------------------------------
// 5. AUTHENTICATION ROUTES
// -----------------------------------------
app.get('/login', (req, res) => res.render('login', { error: null }));

app.post('/login', passport.authenticate('local', {
    successRedirect: '/admin',
    failureRedirect: '/login'
}));

app.get('/logout', (req, res, next) => {
    req.logout((err) => {
        if (err) return next(err);
        res.redirect('/');
    });
});

// -----------------------------------------
// 6. ADMIN INTELLIGENCE DASHBOARD (PROTECTED)
// -----------------------------------------
app.get('/admin', checkAuth, async (req, res) => {
    try {
        const products = await Product.find({}).lean();
        
        const stats = {
            totalProducts: products.length,
            syncedCount: products.filter(p => p.custom_label_0).length,
            avgSpread: 0
        };

        let totalSpread = 0;
        let spreadableItems = 0;

        products.forEach(p => {
            if (p.custom_label_0) {
                const compPrice = parseFloat(p.custom_label_0);
                const spread = ((p.price - compPrice) / compPrice) * 100;
                p.current_spread = spread.toFixed(2);
                totalSpread += spread;
                spreadableItems++;
            }
        });

        stats.avgSpread = spreadableItems > 0 ? (totalSpread / spreadableItems).toFixed(2) : 0;

        res.render('admin', { products, stats, searchQuery: '' });
    } catch (error) {
        res.status(500).send("Error loading admin dashboard");
    }
});

// --- BULK CSV IMPORT ROUTE ---
app.post('/admin/bulk-import', checkAuth, upload.single('productCsv'), async (req, res) => {
    const results = [];
    const filePath = req.file.path;

    // We use a ReadStream to handle large files without crashing server memory
    fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', async () => {
            let processedCount = 0;
            let errorCount = 0;

            for (const row of results) {
                try {
                    // Data Sanitization: Ensure numbers are actually numbers
                    const productData = {
                        id: parseInt(row.id),
                        title: row.title,
                        description: row.description,
                        price: parseFloat(row.price),
                        cost: parseFloat(row.cost || 0),
                        image: row.image,
                        sku: row.sku,
                        gtin: row.gtin,
                        brand: row.brand || 'Vendex',
                        category: row.category,
                        availability: 'in_stock'
                    };

                    // UPSERT Logic: Search by SKU (Unique Identifier)
                    await Product.findOneAndUpdate(
                        { sku: productData.sku }, 
                        productData, 
                        { upsert: true, new: true }
                    );
                    processedCount++;
                } catch (err) {
                    console.error(`Import Error for SKU ${row.sku}:`, err.message);
                    errorCount++;
                }
            }

            // Cleanup: Delete temporary file
            fs.unlinkSync(filePath);

            res.json({ 
                success: true, 
                message: `Import complete. Processed: ${processedCount}, Errors: ${errorCount}` 
            });
        });
});

// Manual Sync Trigger Route
app.post('/admin/sync-now', checkAuth, (req, res) => {
    console.log("🔄 Manual Sync Started by Admin...");
    
    // Command to run your python script (use absolute path)
    // We point to the 'python3' INSIDE your venv folder
    const pythonPath = '/Users/aniparuc/MyNodeShop/venv/bin/python3';
    const scriptPath = '/Users/aniparuc/MyNodeShop/services/intelligence/watcher.py';

    exec(`${pythonPath} ${scriptPath}`, (error, stdout, stderr) => {
        if (error) {
            console.error(`Exec Error: ${error}`);
            return res.status(500).json({ success: false, error: error.message });
        }
        console.log(`Watcher Output: ${stdout}`);
        res.json({ success: true, message: "Sync complete!" });
    });
});

app.post('/admin/update-price', checkAuth, async (req, res) => {
    try {
        const { productId, newPrice } = req.body;
        await Product.findOneAndUpdate({ id: productId }, { price: parseFloat(newPrice) });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: "Failed to update price" });
    }
});

// Route to update Product Cost (for Profit Calculation)
app.post('/admin/update-cost', checkAuth, async (req, res) => {
    try {
        const { productId, newCost } = req.body;
        await Product.findOneAndUpdate({ id: productId }, { cost: parseFloat(newCost) });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: "Failed to update cost" });
    }
});

// -----------------------------------------
// 7. SERVER STARTUP
// -----------------------------------------
const startServer = async () => {
  try {
    if (!process.env.MONGO_URI) throw new Error("MONGO_URI missing!");

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ MongoDB Connected');

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));
  } catch (err) {
    console.error('❌ Connection Error:', err.message);
    process.exit(1); 
  }
};

startServer();