const express = require("express");

const {
  getPairRate,
  getLatestRates,
  refreshCachedEntries,
  pairKey,
} = require("../controllers/fxController");

const RateCache = require("../models/RateCache");

const router = express.Router();

const FX_API_V6_KEY = process.env.FX_API_V6_KEY;

// GET /fx/rates - Get latest exchange rates for a base currency
router.get("/fx/rates", async (req, res) => {
  const base = (req.query.base || "NGN").toUpperCase();
  if (!FX_API_V6_KEY) {
    return res.status(500).json({ error: "FX API key missing" });
  }
  try {
    const data = await getLatestRates(base);
    return res.json(data);
  } catch (err) {
    console.error("Error fetching rates:", err);
    return res.status(502).json({ error: "Failed to fetch rates" });
  }
});

// GET /fx/pair - Get conversion rate for a currency pair
router.get("/fx/pair", async (req, res) => {
  const base = (req.query.base || "USD").toUpperCase();
  const target = (req.query.target || "NGN").toUpperCase();
  const amount = Number(req.query.amount || "1");

  if (!FX_API_V6_KEY) {
    return res.status(500).json({ error: "FX API key missing" });
  }

  try {
    const rateData = await getPairRate(base, target);
    const conversion_result = Number.isFinite(amount)
      ? +(amount * rateData.conversion_rate).toFixed(4)
      : rateData.conversion_rate;

    return res.json({
      result: "success",
      pair: {
        base_code: rateData.base_code,
        target_code: rateData.target_code,
        conversion_rate: rateData.conversion_rate,
        conversion_result,
        time_last_update_utc: rateData.time_last_update_utc,
        time_next_update_utc: rateData.time_next_update_utc,
      },
    });
  } catch (error) {
    console.error("Error fetching pair rate:", error);
    return res.status(502).json({ error: "Failed to fetch rates" });
  }
});

router.get("/fx/pairs", async (req, res) => {
  const pairsParam = req.query.pairs;
  if (!pairsParam) {
    return res
      .status(400)
      .json({ error: "pairs query required, e.g. USD:EUR,EUR:GBP" });
  }
  if (!FX_API_V6_KEY) {
    return res.status(500).json({ error: "FX API key missing" });
  }

  const pairs = pairsParam
    .toString()
    .split(",")
    .map((p) => p.split(":"))
    .filter(([base, quote]) => base && quote)
    .map(([base, quote]) => ({
      base: base.toUpperCase(),
      quote: quote.toUpperCase(),
    }));

  const bases = Array.from(new Set(pairs.map((p) => p.base)));

  try {
    const latestMap = new Map();
    await Promise.all(
      bases.map(async (base) => {
        const latest = await getLatestRates(base);
        latestMap.set(base, latest.conversion_rates || {});
      })
    );

    const result = pairs.map(({ base, quote }) => {
      const currentRates = latestMap.get(base) || {};
      const rate = currentRates[quote] ?? null;
      return {
        base,
        quote,
        rate,
      };
    });

    return res.json({ result: "success", pairs: result });
  } catch (error) {
    console.error("Error fetching pairs:", error);
    return res.status(502).json({ error: "Failed to fetch pairs" });
  }
});

router.get("/fx/convert", async (req, res) => {
  const base = (req.query.base || "USD").toUpperCase();
  const target = (req.query.target || "NGN").toUpperCase();
  const amount = Number(req.query.amount || "1");

  if (!FX_API_V6_KEY) {
    return res.status(500).json({ error: "FX API key missing" });
  }
  if (!Number.isFinite(amount)) {
    return res.status(400).json({ error: "amount must be a number" });
  }

  try {
    const rateData = await getPairRate(base, target);
    const conversion_result = +(amount * rateData.conversion_rate).toFixed(4);

    return res.json({
      result: "success",
      base_code: rateData.base_code,
      target_code: rateData.target_code,
      amount,
      conversion_rate: rateData.conversion_rate,
      conversion_result,
      time_last_update_utc: rateData.time_last_update_utc,
      time_next_update_utc: rateData.time_next_update_utc,
    });
  } catch (error) {
    console.error("Error converting currency:", error);
    return res.status(502).json({ error: "Failed to convert currency" });
  }
});

router.get("/fx/history", async (req, res) => {
  const base = (req.query.base || "USD").toUpperCase();
  const quote = (req.query.quote || "NGN").toUpperCase();
  const days = Number(req.query.days || "7");

  if (!base || !quote) {
    return res.status(400).json({ error: "base and quote are required" });
  }

  if (days < 1 || days > 365) {
    return res.status(400).json({ error: "days must be between 1 and 365" });
  }

  try {
    const key = pairKey(base, quote);

    const daysAgo = Date.now() - days * 24 * 60 * 60 * 1000;

    const historicalData = await RateCache.find({
      key: key,
      fetchedAt: { $gte: daysAgo },
    }).sort({ fetchedAt: 1 });

    if (!historicalData || historicalData.length === 0) {
      return res.status(404).json({
        error: "No historical data found for this pair",
        note: "Data is only available from when it was first cached",
      });
    }

    const history = [];
    const seenDates = new Set();

    historicalData.forEach((entry) => {
      const date = new Date(entry.fetchedAt).toISOString().split("T")[0];

      if (!seenDates.has(date)) {
        seenDates.add(date);
        history.push({
          date: date,
          rate: entry.data.conversion_rate,
          fetchedAt: entry.fetchedAt,
          time_last_update_utc: entry.data.time_last_update_utc,
        });
      }
    });

    return res.json({
      result: "success",
      base_code: base,
      target_code: quote,
      days_requested: days,
      data_points: history.length,
      history: history,
    });
  } catch (error) {
    console.error("Error fetching history:", error);
    return res
      .status(502)
      .json({ error: "Failed to fetch history from database" });
  }
});

module.exports = {
  router,
  refreshCachedEntries,
};
