require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cron = require("node-cron");
const { connectDB } = require("./db/db");

const { router: fxRouter, refreshCachedEntries } = require("./routes/fx");
const { router: tipsRouter } = require("./routes/tips");
const { cacheCommonPairs } = require("./controllers/fxController");

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

connectDB()
  .then(() => {
    // Cache common currency pairs daily at 1 AM for historical data
    // Data updates every 24 hours, so once daily is sufficient
    cron.schedule("0 1 * * *", cacheCommonPairs);

    // Refresh existing cached entries daily at midnight
    cron.schedule("0 0 * * *", refreshCachedEntries);

    // Initial cache on startup
    cacheCommonPairs();

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
