require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose'); // <--- This was missing!
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
// SERVER STARTUP
// -----------------------------------------

const startServer = async () => {
  try {
    console.log('⏳ Attempting to connect to MongoDB...');
    
    // 1. Check if the variable exists
    if (!process.env.MONGO_URI) {
        throw new Error("MONGO_URI is missing from Render Environment Variables!");
    }

    // 2. Debug Log: Prints first 10 chars to check for "MONGO_URI=" or quotes
    console.log('URI Debug:', `[${process.env.MONGO_URI.substring(0, 10)}]`);

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