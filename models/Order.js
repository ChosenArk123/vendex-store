const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
    customerName: { type: String }, // NEW: Stores "John Doe"
    customerEmail: { type: String, required: true },
    customerPhone: { type: String },
    
    shippingAddress: { // NEW: Stores the address permanently
        line1: String,
        city: String,
        state: String,
        postal_code: String,
        country: String
    },

    stripeSessionId: { type: String, required: true },
    
    products: [{
        productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
        quantity: Number,
        priceAtPurchase: Number // Good to have for history
    }],
    
    totalAmount: Number,
    status: {
        type: String,
        enum: ['received', 'processing', 'packing', 'shipped', 'delivered'],
        default: 'received'
    },
    
    notificationsEnabled: { type: Boolean, default: false },
    notificationMethod: { type: String, enum: ['email', 'sms', 'both'], default: 'email' },
    
    estimatedCompletion: { type: Date },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Order', orderSchema);