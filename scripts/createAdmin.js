// scripts/createAdmin.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const Admin = require('../models/Admin');
const path = require('path');
const dotenv = require('dotenv');

// 1. Force load the .env file from the root directory
// __dirname = .../vendex-store/scripts
// path.join moves up one level to .../vendex-store/.env
dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function updateAdmin() {
    try {
        console.log("------------------------------------------------");
        console.log("🔐 Vendex Admin Updater");
        console.log("------------------------------------------------");

        const uri = process.env.MONGO_URI;
        const user = process.env.ADMIN_USERNAME || 'admin';
        const pass = process.env.ADMIN_PASSWORD;

        // Debugging: Check if .env is being read (Do not log full password in production logs)
        if (!uri) throw new Error("❌ MONGO_URI is missing from .env");
        if (!pass) throw new Error("❌ ADMIN_PASSWORD is missing from .env");

        console.log(`Connecting to DB...`);
        await mongoose.connect(uri);
        console.log("✅ DB Connected.");

        // 2. Hash the NEW password from .env
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(pass, salt);

        // 3. Update or Create the Admin
        const existingAdmin = await Admin.findOne({ username: user });

        if (existingAdmin) {
            console.log(`👤 User '${user}' found. Updating password...`);
            existingAdmin.password = hashedPassword;
            await existingAdmin.save();
            console.log("✅ Password successfully UPDATED in MongoDB.");
        } else {
            console.log(`👤 User '${user}' not found. Creating new admin...`);
            const newAdmin = new Admin({
                username: user,
                password: hashedPassword
            });
            await newAdmin.save();
            console.log("✅ New Admin successfully CREATED.");
        }

        console.log("------------------------------------------------");
        process.exit(0);

    } catch (err) {
        console.error("❌ Error:", err.message);
        process.exit(1);
    }
}

updateAdmin();