require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const Product = require('./models/Product'); 

const app = express();

// Set EJS as the templating engine
app.set('view engine', 'ejs');
// serve static files (css, images) if you have a public folder
app.use(express.static('public')); 

// -----------------------------------------
// ROUTES
// -----------------------------------------

// THE HOMEPAGE ROUTE (With Search)
app.get('/', async (req, res) => {
    try {
        const searchQuery = req.query.search;
        let mongoQuery = {};

        // If user searched, build a database filter
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
// SERVER STARTUP (The Fix)
// -----------------------------------------

const startServer = async () => {
  try {
    // 1. Attempt to connect to MongoDB first
    console.log('⏳ Attempting to connect to MongoDB...');
    // Add this right before await mongoose.connect(...)
    console.log('URI Type:', typeof process.env.MONGO_URI);
    console.log('URI Value (first 10 chars):', process.env.MONGO_URI ? process.env.MONGO_URI.substring(0, 10) : 'UNDEFINED');

    await mongoose.connect(process.env.MONGO_URI, { ... });
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000 // Fail after 5s if no connection
    });
    
    console.log('✅ MongoDB Connected Successfully');

    // 2. ONLY start the server if DB connects
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log(`🚀 Server is running on port ${PORT}`);
    });

  } catch (err) {
    // 3. If DB fails, print the REAL error and stop
    console.error('❌ MongoDB Connection Error:', err.message);
    process.exit(1); // Stop the app so Render knows it failed
  }
};

startServer();