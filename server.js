require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose'); 
const Product = require('./models/Product'); 
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY); 

const app = express();

// Configuration
app.set('view engine', 'ejs');
app.use(express.static('public')); 
app.use(express.json()); // Required for Cart data

// -----------------------------------------
// 1. HOMEPAGE ROUTE
// -----------------------------------------
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
        
        res.render('index', { 
            products: products, 
            searchQuery: searchQuery || '' 
        });
    } catch (error) {
        console.error("Error fetching products:", error);
        res.status(500).send("Error loading products");
    }
});

// -----------------------------------------
// 2. PRODUCT DETAIL ROUTE
// -----------------------------------------
app.get('/product/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const product = await Product.findOne({ id: id }).lean();
        
        if (product) {
            res.render('product', { 
                product: product,
                searchQuery: '' 
            });
        } else {
            res.status(404).send('Product not found');
        }
    } catch (error) {
        console.error("Error fetching product details:", error);
        res.status(500).send("Error loading product");
    }
});

// -----------------------------------------
// 3. GOOGLE SHOPPING FEED ROUTE (NEW)
// Aligning with Week 9 & 15 of Business Plan
// -----------------------------------------
app.get('/feed.xml', async (req, res) => {
    try {
        const products = await Product.find({}).lean();
        const siteUrl = `${req.protocol}://${req.get('host')}`;

        // XML Header
        let xml = `<?xml version="1.0"?>
<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">
<channel>
<title>Vendex Store</title>
<link>${siteUrl}</link>
<description>Premium Tech Store</description>`;

        [cite_start]// Generate Item Blocks [cite: 2213]
        products.forEach(p => {
            xml += `
<item>
    <g:id>${p.sku || p.id}</g:id>
    <g:title><![CDATA[${p.title}]]></g:title>
    <g:description><![CDATA[${p.description}]]></g:description>
    <g:link>${siteUrl}/product/${p.id}</g:link>
    <g:image_link>${p.image}</g:image_link>
    <g:condition>${p.condition || 'new'}</g:condition>
    <g:availability>${p.availability || 'in_stock'}</g:availability>
    <g:price>${p.price.toFixed(2)} USD</g:price>
    <g:brand>${p.brand || 'Vendex'}</g:brand>
    <g:google_product_category><![CDATA[${p.google_product_category || ''}]]></g:google_product_category>
    ${p.gtin ? `<g:gtin>${p.gtin}</g:gtin>` : ''}
    ${p.mpn ? `<g:mpn>${p.mpn}</g:mpn>` : ''}
</item>`;
        });

        xml += `
</channel>
</rss>`;

        res.header('Content-Type', 'text/xml');
        res.send(xml);
    } catch (err) {
        console.error("Feed Generation Error:", err);
        res.status(500).send('Error generating feed');
    }
});

// -----------------------------------------
// 4. CHECKOUT ROUTES (STRIPE)
// -----------------------------------------
app.post('/create-checkout-session', async (req, res) => {
    try {
        const { cart } = req.body;

        if (!cart || cart.length === 0) {
            return res.status(400).json({ error: 'Cart is empty' });
        }

        const lineItems = cart.map(item => ({
            price_data: {
                currency: 'usd',
                product_data: {
                    name: item.title,
                    images: [item.image], 
                },
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
        console.error("Stripe Error:", error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.get('/success', (req, res) => {
    res.render('success');
});

app.get('/cancel', (req, res) => {
    res.render('cancel');
});

// -----------------------------------------
// SERVER STARTUP
// -----------------------------------------
const startServer = async () => {
  try {
    console.log('⏳ Attempting to connect to MongoDB...');
    
    if (!process.env.MONGO_URI) {
        throw new Error("MONGO_URI is missing from Environment Variables!");
    }

    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000 
    });
    
    console.log('✅ MongoDB Connected Successfully');

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log(`🚀 Server is running on port ${PORT}`);
    });

  } catch (err) {
    console.error('❌ MongoDB Connection Error:', err.message);
    process.exit(1); 
  }
};

startServer();