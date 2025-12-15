require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose'); 
const Product = require('./models/Product'); 
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY); // Initialize Stripe

const app = express();

// Set EJS as the templating engine
app.set('view engine', 'ejs');

// serve static files (css, images) if you have a public folder
app.use(express.static('public')); 

// Middleware to parse JSON bodies (REQUIRED for passing cart data from frontend)
app.use(express.json());

// -----------------------------------------
// ROUTES
// -----------------------------------------

// THE HOMEPAGE ROUTE (With Search)
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

        const products = await Product.find(mongoQuery);
        
        res.render('index', { 
            products: products, 
            searchQuery: searchQuery || '' 
        });
    } catch (error) {
        console.error("Error fetching products:", error);
        res.status(500).send("Error loading products");
    }
});

// PRODUCT DETAIL ROUTE
app.get('/product/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const product = await Product.findOne({ id: id });
        
        if (product) {
            res.render('product', { product: product });
        } else {
            res.status(404).send('Product not found');
        }
    } catch (error) {
        console.error("Error fetching product details:", error);
        res.status(500).send("Error loading product");
    }
});

// -----------------------------------------
// STRIPE CHECKOUT ROUTES
// -----------------------------------------

app.post('/create-checkout-session', async (req, res) => {
    try {
        const { cart } = req.body;

        if (!cart || cart.length === 0) {
            return res.status(400).json({ error: 'Cart is empty' });
        }

        // Map cart items to Stripe line items
        const lineItems = cart.map(item => ({
            price_data: {
                currency: 'usd',
                product_data: {
                    name: item.title,
                    images: [item.image], 
                },
                unit_amount: Math.round(item.price * 100), // Stripe uses cents
            },
            quantity: item.quantity,
        }));

        // Create Session
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
    
    // 1. Check if the variable exists
    if (!process.env.MONGO_URI) {
        throw new Error("MONGO_URI is missing from Render Environment Variables!");
    }

    // 2. Debug Log (Masked)
    console.log('URI Debug:', `[${process.env.MONGO_URI.substring(0, 10)}...]`);

    // 3. Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000 
    });
    
    console.log('✅ MongoDB Connected Successfully');

    // 4. Start Server
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