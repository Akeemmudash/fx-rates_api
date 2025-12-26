require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cron = require("node-cron");
const { connectDB } = require("./db/db");

const { router: fxRouter, refreshCachedEntries } = require("./routes/fx");
const { router: tipsRouter } = require("./routes/tips");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});

// Connect to MongoDB before starting the server
connectDB()
  .then(() => {
    // Schedule cache refresh every day at midnight
    cron.schedule("0 0 * * *", refreshCachedEntries);

    app.use(fxRouter);
    app.use(tipsRouter);

    app.listen(PORT, () => {
      console.log(`FX rates API running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Failed to connect to MongoDB:", err);
    process.exit(1);
  });
