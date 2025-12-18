// scripts/seedFakeData.js
require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('../models/Product');

// --- CONFIGURATION ---
const TOTAL_PRODUCTS = 50; // Week 6 Goal is 30-40 products 
const BRAND_NAME = "Vendex";

// --- WEEK 3 NICHE DATA  ---
const niches = [
    {
        type: "Desk Lamp",
        google_category: "Home & Garden > Lighting > Lamps",
        images: [
            "https://loremflickr.com/800/800/desk,lamp?lock=1",
            "https://loremflickr.com/800/800/desk,lamp?lock=2"
        ],
        adjectives: ["Modern", "Dimmable", "LED", "Architect", "Wireless Charging", "Eye-Caring"],
        features: ["USB Port", "3 Color Modes", "Touch Control", "Auto-Timer"]
    },
    {
        type: "Pet Grooming Kit",
        google_category: "Animals & Pet Supplies > Pet Supplies > Grooming",
        images: [
            "https://loremflickr.com/800/800/dog,grooming?lock=1",
            "https://loremflickr.com/800/800/cat,grooming?lock=2"
        ],
        adjectives: ["Professional", "Low Noise", "Rechargeable", "Cordless", "Heavy Duty"],
        features: ["4 Guard Combs", "Stainless Steel Blades", "Ultra Quiet Motor", "Ergonomic Grip"]
    },
    {
        type: "Solar Outdoor Light",
        google_category: "Home & Garden > Lighting > Outdoor Lighting",
        images: [
            "https://loremflickr.com/800/800/garden,solar?lock=1",
            "https://loremflickr.com/800/800/outdoor,light?lock=2"
        ],
        adjectives: ["Waterproof", "Motion Sensor", "Wide Angle", "Security", "Dusk-to-Dawn"],
        features: ["IP65 Water Resistant", "1200mAh Battery", "3 Lighting Modes", "Easy Installation"]
    },
    {
        type: "Portable Handheld Fan",
        google_category: "Home & Garden > Household Appliances > Climate Control Appliances > Fans",
        images: [
            "https://loremflickr.com/800/800/handheld,fan?lock=1",
            "https://loremflickr.com/800/800/fan,cooling?lock=2"
        ],
        adjectives: ["Mini", "USB Rechargeable", "Pocket-Sized", "3-Speed", "Bladeless"],
        features: ["20 Hour Battery", "Quiet Operation", "Power Bank Function", "Lanyard Included"]
    }
];

// --- GENERATOR UTILS ---
const getRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];
const getRandomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

// Title Logic per Week 2 [cite: 367]
// "Adjective + Category + Features"
const generateTitle = (niche) => {
    const adj1 = getRandom(niche.adjectives);
    const adj2 = getRandom(niche.adjectives);
    const feature = getRandom(niche.features);
    // Ensure adjectives are different
    return `${adj1} ${niche.type} ${adj2 === adj1 ? '' : adj2} with ${feature}`;
};

const generateProducts = () => {
    const products = [];

    for (let i = 1; i <= TOTAL_PRODUCTS; i++) {
        const niche = getRandom(niches);
        const price = getRandomInt(19, 89) + 0.99; // Prices between 19.99 and 89.99

        products.push({
            id: i,
            // Week 9 Requirement: SKU must be unique [cite: 477]
            sku: `${BRAND_NAME.toUpperCase().substring(0, 3)}-${niche.type.substring(0, 3).toUpperCase()}-${1000 + i}`,

            // Week 2 Requirement: Title Structure [cite: 367]
            title: generateTitle(niche),

            description: `Experience the best in class with our ${niche.type}. Features include: ${niche.features.join(', ')}. Perfect for daily use.`,
            price: price,
            image: getRandom(niche.images),
            rating: (Math.random() * (5.0 - 3.5) + 3.5).toFixed(1), // Ratings between 3.5 and 5.0
            reviews: getRandomInt(10, 500),

            // Google Feed Attributes [cite: 476-480]
            brand: BRAND_NAME,
            google_product_category: niche.google_category,
            product_type: niche.type,
            gtin: `00${getRandomInt(100000000000, 999999999999)}`, // Fake GTIN-12
            mpn: `MPN-${getRandomInt(1000, 9999)}`,
            condition: "new",
            availability: "in_stock",
            custom_label_0: price > 50 ? "High Margin" : "Volume Seller" // Week 17 Ad Labeling
        });
    }
    return products;
};

// --- EXECUTION ---
const seedDB = async () => {
    try {
        console.log('⏳ Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Connected.');

        // Optional: Clear existing data
        console.log('🧹 Clearing old products...');
        await Product.deleteMany({});

        console.log(`🌱 Seeding ${TOTAL_PRODUCTS} products...`);
        const fakeProducts = generateProducts();
        await Product.insertMany(fakeProducts);

        console.log('🎉 Database populated successfully!');
        console.log('👉 Check your site homepage to see the products.');
        console.log('👉 Check /feed.xml to see your Google Shopping Feed.');

        process.exit();
    } catch (err) {
        console.error('❌ Seeding Error:', err);
        process.exit(1);
    }
};

seedDB();