const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
    // --- Standard Store Fields ---
    id: { type: Number, required: true, unique: true }, 
    title: { type: String, required: true },            
    description: { type: String, required: true },      
    price: { type: Number, required: true },
    image: { type: String, required: true },            
    rating: { type: Number, default: 0 },
    reviews: { type: Number, default: 0 },

    // --- Google Shopping / Merchant Center Fields ---
    sku: { type: String, required: true, unique: true }, 
    brand: { type: String, default: 'Vendex' },          
    google_product_category: { type: String },           
    product_type: { type: String },                      
    
    // Identifiers (At least 2 of 3 required for most goods)
    gtin: { type: String }, 
    mpn: { type: String },  
    
    // Status Fields 
    condition: { type: String, default: 'new' },         
    availability: { type: String, default: 'in_stock' }, 
    
    // --- Ad Optimization Fields ---
    custom_label_0: { type: String }, 
    custom_label_1: { type: String }, 
    shipping_weight: { type: String }, 
});

module.exports = mongoose.model('Product', productSchema);