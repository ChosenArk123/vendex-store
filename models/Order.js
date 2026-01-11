const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
    customerEmail: { type: String, required: true },
    customerPhone: { type: String }, // Added back
    stripeSessionId: { type: String, required: true },
    products: [{
        productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
        quantity: Number
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