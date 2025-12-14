// -----------------------------------------
// SERVER STARTUP
// -----------------------------------------

const startServer = async () => {
  try {
    console.log('⏳ Attempting to connect to MongoDB...');
    
    // 1. DEBUGGING: Check if the variable exists and what it looks like
    if (!process.env.MONGO_URI) {
        throw new Error("MONGO_URI is missing from Render Environment Variables!");
    }

    // This prints the first 10 characters so we can see if there are hidden quotes or spaces
    // e.g., if it prints ["mongodb+s], you have quotes!
    console.log('URI Debug:', `[${process.env.MONGO_URI.substring(0, 10)}]`);

    // 2. CONNECT (The Real Command)
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000 // Fail after 5s if no connection
    });
    
    console.log('✅ MongoDB Connected Successfully');

    // 3. START SERVER
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log(`🚀 Server is running on port ${PORT}`);
    });

  } catch (err) {
    console.error('❌ MongoDB Connection Error:', err.message);
    process.exit(1); 
  }
};

startServer();