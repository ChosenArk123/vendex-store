const mongoose = require('mongoose');
const fs = require('fs');
const csv = require('csv-parser');
const Product = require('../models/Product'); // Adjust path to your model
require('dotenv').config();

const results = [];
const CSV_FILE_PATH = 'data/import.csv'; // Ensure you create this folder/file

console.log(`⏳ Starting Bulk Import from ${CSV_FILE_PATH}...`);

mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log("✅ Connected to DB. Reading CSV...");
        
        fs.createReadStream(CSV_FILE_PATH)
            .pipe(csv())
            .on('data', (data) => {
                // Map CSV columns to Schema fields
                [cite_start]// This aligns with the "Week 6 Bulk Import Template" [cite: 1515]
                results.push({
                    id: parseInt(data.ID), // Ensure your CSV has an 'ID' column
                    sku: data.SKU,
                    title: data.Title, 
                    description: data.Description,
                    price: parseFloat(data.Price),
                    image: data.Image_URL,
                    brand: data.Brand,
                    google_product_category: data.Google_Category,
                    gtin: data.GTIN,
                    mpn: data.MPN,
                    condition: data.Condition || 'new',
                    availability: data.Availability || 'in_stock'
                });
            })
            .on('end', async () => {
                try {
                    // Optional: Clear existing products to prevent duplicates during testing
                    // await Product.deleteMany({}); 
                    
                    await Product.insertMany(results);
                    console.log(`🎉 Successfully imported ${results.length} products.`);
                    console.log("👉 You can now check /feed.xml to see them live.");
                    process.exit();
                } catch (e) {
                    console.error("❌ Import Failed:", e.message);
                    process.exit(1);
                }
            });
    })
    .catch(err => {
        console.error("❌ DB Connection Failed:", err);
        process.exit(1);
    });