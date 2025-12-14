const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  id: Number,
  sku: String,
  title: String,
  description: String,
  features: [String],
  price: Number,
  condition: String,
  availability: String,
  brand: String,
  shipping_time: String,
  rating: Number,
  reviews: Number,
  image: String,
  google_category: String
});

module.exports = mongoose.model('Product', productSchema);