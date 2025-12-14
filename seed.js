require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('./models/Product');
const products = require('./products.json');

mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    console.log('Connected to MongoDB...');
    
    // Clear old data to avoid duplicates
    await Product.deleteMany({});
    console.log('Cleared existing products.');

    // Insert new data
    await Product.insertMany(products);
    console.log('Added products from JSON!');

    process.exit();
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });