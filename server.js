require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');

// Models
const Product = require('./models/Product');
const Admin = require('./models/Admin');
const Order = require('./models/Order');

// Libraries
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const session = require('express-session');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const csv = require('csv-parser');

const app = express();
app.set('trust proxy', 1);
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

// -----------------------------------------
// 3. CHECKOUT & ORDER TRACKING ROUTES
// -----------------------------------------

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
            success_url: `${req.headers.origin}/order/processing?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${req.headers.origin}/cancel`,
            shipping_address_collection: { allowed_countries: ['US', 'CA', 'GB'] }
        });
        res.json({ url: session.url });
    } catch (err) { res.status(500).json({ error: 'Checkout failed' }); }
});

app.get('/success', (req, res) => res.render('success'));
app.get('/cancel', (req, res) => res.render('cancel'));

// The "Landing" Page after purchase (Order Creation)
// UPDATED: Now ALWAYS syncs with Stripe to fix $0.00 issues
app.get('/order/processing', async (req, res) => {
    const { session_id } = req.query;

    if (!session_id) return res.redirect('/');

    try {
        // 1. Retrieve the session from Stripe
        const session = await stripe.checkout.sessions.retrieve(session_id, {
            expand: ['line_items']
        });

        // 2. Find or Create the order
        let order = await Order.findOne({ stripeSessionId: session_id });
        if (!order) {
            order = new Order({ stripeSessionId: session_id });
        }

        // 3. FORCE UPDATE from Stripe (The "Pull Straight from Payment Page" Logic)
        // We overwrite the DB data every time this page loads to ensure accuracy.
        
        order.customerName = session.customer_details?.name || "Valued Customer";
        order.customerEmail = session.customer_details?.email || "no-email@example.com";
        order.customerPhone = session.customer_details?.phone || "";
        order.totalAmount = session.amount_total; // Updates the price
        
        // Update Address
        if (session.customer_details?.address) {
            order.shippingAddress = {
                line1: session.customer_details.address.line1,
                city: session.customer_details.address.city,
                state: session.customer_details.address.state,
                postal_code: session.customer_details.address.postal_code,
                country: session.customer_details.address.country
            };
        }

        // Ensure defaults
        order.status = order.status || 'received';
        order.estimatedCompletion = order.estimatedCompletion || new Date(Date.now() + 86400000);
        
        await order.save();
        console.log("✅ Order forced-sync complete.");

        
        // 4. Prepare data for the view
        const orderData = order.toObject();
        
        // Map Items directly from Stripe for the view
        if (session.line_items && session.line_items.data) {
            orderData.items = session.line_items.data.map(li => ({
                title: li.description,
                quantity: li.quantity,
                price: (li.amount_total / li.quantity) / 100 
            }));
        }

        // Safe Defaults for View
        if (!orderData.customer) {
            orderData.customer = {
                name: order.customerName,
                email: order.customerEmail,
                phone: order.customerPhone
            };
        }

        res.render('order_tracking', { order: orderData });

    } catch (err) {
        console.error("Order Processing Error:", err);
        res.redirect('/');
    }
});

// API Route: For "Live Updates" polling
app.get('/api/order/:id/status', async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ error: "Order not found" });

        res.json({ 
            status: order.status, 
            percent: getPercentFromStatus(order.status),
            estimated: order.estimatedCompletion 
        });
    } catch (e) {
        res.status(500).send('Server Error');
    }
});

// API Route: Enable Notifications (SMS or Email)
app.post('/api/order/:id/notify', async (req, res) => {
    const { method, value } = req.body; 
    
    try {
        const updateData = { 
            notificationsEnabled: true,
            notificationMethod: method 
        };

        if (method === 'sms') {
            updateData.customerPhone = value;
        } else {
            updateData.customerEmail = value;
        }

        const order = await Order.findByIdAndUpdate(req.params.id, updateData, { new: true });
        
        if (order) {
            res.json({ success: true, message: "Notifications enabled!" });
        } else {
            res.status(404).json({ success: false, error: "Order not found" });
        }
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// Helper for progress bar calculation
function getPercentFromStatus(status) {
    const map = { 'received': 10, 'processing': 30, 'packing': 60, 'shipped': 90, 'delivered': 100 };
    return map[status] || 0;
}

// -----------------------------------------
// 4. ADMIN & INTELLIGENCE ROUTES
// -----------------------------------------

app.get('/login', (req, res) => res.render('login', { error: null }));
app.post('/login', passport.authenticate('local', { successRedirect: '/admin', failureRedirect: '/login' }));
app.get('/logout', (req, res) => req.logout((err) => res.redirect('/')));

app.get('/admin', checkAuth, async (req, res) => {
    try {
        const products = await Product.find({}).lean();
        
        // Data Aggregation logic
        let totalInventoryValue = 0; 
        let totalCostBasis = 0;      
        let totalSpread = 0;
        let syncedCount = 0;

        products.forEach(p => {
            totalInventoryValue += (p.price || 0);
            totalCostBasis += (p.cost || 0);
            
            if (p.custom_label_0) {
                const comp = parseFloat(p.custom_label_0);
                const spread = ((p.price - comp) / comp) * 100;
                p.current_spread = spread.toFixed(1);
                totalSpread += spread;
                syncedCount++;
            }
        });

        const stats = {
            totalProducts: products.length,
            syncedCount: syncedCount,
            avgSpread: syncedCount > 0 ? (totalSpread / syncedCount).toFixed(1) : 0,
            projectedProfit: (totalInventoryValue - totalCostBasis).toFixed(2),
            marginPotential: totalInventoryValue > 0 ? (((totalInventoryValue - totalCostBasis) / totalInventoryValue) * 100).toFixed(1) : 0
        };

        res.render('admin', { products, stats });
    } catch (err) {
        res.status(500).send("Admin Load Error");
    }
});

// --- DYNAMIC PATH LOGIC (Critical for Render vs Local) ---
app.post('/admin/sync-now', checkAuth, (req, res) => {
    
    // Respects .env or defaults to standard 'python3'
    const pythonCmd = process.env.PYTHON_PATH || 'python3';
    
    const watcherPath = path.join(__dirname, 'services', 'intelligence', 'watcher.py');
    const brainPath = path.join(__dirname, 'services', 'intelligence', 'brain.py');

    console.log(`🔄 Starting Intelligence Cycle using: ${pythonCmd}`);

    // Run Scraper first
    exec(`${pythonCmd} ${watcherPath}`, (err1, stdout1) => {
        if (err1) {
            console.error("Watcher Error:", err1);
            return res.status(500).json({ success: false, error: "Watcher Failed. Check logs." });
        }
        
        console.log("✅ Watcher Finished. Starting Brain...");
        
        // Run Pricing Engine second
        exec(`${pythonCmd} ${brainPath}`, (err2, stdout2) => {
            if (err2) {
                console.error("Brain Error:", err2);
                return res.status(500).json({ success: false, error: "Brain Failed. Check logs." });
            }
            
            console.log("✅ Brain Finished. Pricing Updated.");
            res.json({ success: true, message: "Intelligence Cycle Complete: Market Scanned & Prices Adjusted." });
        });
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
// 5. BULK CSV IMPORT ENGINE
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
// 6. SERVER STARTUP
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