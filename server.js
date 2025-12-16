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

        // .lean() makes the data lightweight and JSON-ready
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
// 2. PRODUCT DETAIL ROUTE (FIXED)
// -----------------------------------------
app.get('/product/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        
        // CRITICAL FIX: .lean() is required here!
        // Without it, the EJS page crashes when trying to interpret the product data.
        const product = await Product.findOne({ id: id }).lean();
        
        if (product) {
            res.render('product', { 
                product: product,
                searchQuery: '' // Prevents header error
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
// 3. CHECKOUT ROUTES (STRIPE)
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
        throw new Error("MONGO_URI is missing from Render Environment Variables!");
    }

    // Masked URI logging for safety
    console.log('URI Debug:', `[${process.env.MONGO_URI.substring(0, 10)}...]`);

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