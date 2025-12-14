require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const Product = require('./models/Product'); // <--- This was missing!

const app = express();

// Set EJS as the templating engine
app.set('view engine', 'ejs');

// Connect to MongoDB
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error('Error connecting to MongoDB:', error.message);
    process.exit(1); // Stop the app if DB fails, don't just hang
  }
};

connectDB();

// THE HOMEPAGE ROUTE (With Search)
app.get('/', async (req, res) => {
    // 1. Check if there is a search query in the URL
    const searchQuery = req.query.search;
    let mongoQuery = {};

    // 2. If user searched, build a database filter
    if (searchQuery) {
        mongoQuery = {
            $or: [
                { title: { $regex: searchQuery, $options: 'i' } },
                { description: { $regex: searchQuery, $options: 'i' } },
                { brand: { $regex: searchQuery, $options: 'i' } }
            ]
        };
    }

    // 3. Get products from MongoDB
    const products = await Product.find(mongoQuery);
    
    // 4. Render the page
    res.render('index', { 
        products: products, 
        searchQuery: searchQuery || '' 
    });
});

// PRODUCT DETAIL ROUTE (Updated to use MongoDB)
app.get('/product/:id', async (req, res) => {
    const id = parseInt(req.params.id);
    
    // Find product in MongoDB
    const product = await Product.findOne({ id: id });
    
    if (product) {
        res.render('product', { product: product });
    } else {
        res.status(404).send('Product not found');
    }
});

// Start the server
const startServer = async () => {
  try {
    // 1. Try to connect
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ MongoDB Connected successfully');

    // 2. Only if DB connects, start the server
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log(`Server is running on http://localhost:${PORT}`);
    });

  } catch (error) {
    // 3. If it fails, show the EXACT error and stop
    console.error('❌ MongoDB Connection Error: ', error);
    process.exit(1); // Kill the process so Render knows it failed
  }
};

startServer();
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});