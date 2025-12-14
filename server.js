const express = require('express');
const app = express();
const fs = require('fs');

// Set EJS as the templating engine
app.set('view engine', 'ejs');

// THE HOMEPAGE ROUTE
app.get('/', (req, res) => {
    // 1. Read the products from our JSON file
    const productsData = fs.readFileSync('products.json');
    const products = JSON.parse(productsData);

    // 2. Render the 'index' template and send the products data to it
    res.render('index', { products: products });
});

// NEW: Product Detail Route
app.get('/product/:id', (req, res) => {
    const productsData = fs.readFileSync('products.json');
    const products = JSON.parse(productsData);
    
    // Find the specific product by ID
    const product = products.find(p => p.id == req.params.id);
    
    if (product) {
        res.render('product', { product: product });
    } else {
        res.send('Product not found');
    }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});