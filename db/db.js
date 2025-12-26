const mongoose = require("mongoose");

const MONGODB_URI = process.env.MONGODB_URI;

let isConnected = false;

const connectDB = async () => {
  if (isConnected) {
    console.log("Already connected to MongoDB");
    return;
  }

  if (!MONGODB_URI) {
    console.error("MONGODB_URI is not defined in environment variables");
    throw new Error("MONGODB_URI is required");
  }

  try {
    await mongoose.connect(MONGODB_URI);
    isConnected = true;
    console.log("MongoDB connected successfully");
  } catch (error) {
    console.error("MongoDB connection error:", error);
    throw error;
  }
};

mongoose.connection.on("disconnected", () => {
  isConnected = false;
  console.log("MongoDB disconnected");
});

mongoose.connection.on("error", (err) => {
  console.error("MongoDB error:", err);
});

module.exports = { connectDB };
