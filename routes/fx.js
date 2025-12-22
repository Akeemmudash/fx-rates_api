const express = require("express");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const router = express.Router();

// set a reasonable request timeout to avoid hanging connections
axios.defaults.timeout = 15000;

const FX_API_V6_URL =
  process.env.FX_API_V6_URL || "https://v6.exchangerate-api.com/v6";
const FX_API_V6_KEY = process.env.FX_API_V6_KEY;
const EXCHANGE_RATES_API_KEY = process.env.EXCHANGE_RATES_API_KEY;
const HISTORICAL_API_URL =
  process.env.HISTORICAL_API_URL || "https://api.exchangeratesapi.io/v1";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_FILE = path.join(__dirname, "..", "data", "cache.json");

const cache = new Map();
const pairKey = (base, target) => `pair_${base}_${target}`;
const latestKey = (base) => `latest_${base}`;
const historicalKey = (date, base, quotesKey) =>
  `hist_${date}_${base}_${quotesKey}`;

const isFresh = (entry) => {
  if (!entry) return false;
  const nextUpdate = entry.time_next_update_utc
    ? new Date(entry.time_next_update_utc).getTime()
    : null;
  if (nextUpdate && Date.now() < nextUpdate) return true;
  if (typeof entry.fetchedAt === "number") {
    return Date.now() - entry.fetchedAt < CACHE_TTL_MS;
  }
  return false;
};

const calculateChange = (current, previous) => {
  if (!previous || previous === 0) return 0;
  return ((current - previous) / previous) * 100;
};

const calculateCrossRate = (rates, baseCurrency, quoteCurrency) => {
  if (!rates) return null;
  if (baseCurrency === quoteCurrency) return 1;
  const baseRate = baseCurrency === "EUR" ? 1 : rates[baseCurrency];
  const quoteRate = rates[quoteCurrency];
  if (baseRate === undefined || baseRate === 0 || quoteRate === undefined)
    return null;
  return baseCurrency === "EUR" ? quoteRate : quoteRate / baseRate;
};

function loadCacheFromDisk() {
  try {
    const raw = fs.readFileSync(CACHE_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    Object.entries(parsed).forEach(([key, value]) => {
      if (value && typeof value.fetchedAt === "number") {
        cache.set(key, value);
      }
    });
  } catch {
    // Ignore missing or corrupted cache files
  }
}

function persistCache() {
  try {
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    const serializable = Object.fromEntries(cache.entries());
    fs.writeFileSync(CACHE_FILE, JSON.stringify(serializable));
  } catch {
    // Ignore disk write errors
  }
}

async function fetchPairRate(base, target) {
  const url = `${FX_API_V6_URL}/${FX_API_V6_KEY}/pair/${base}/${target}`;
  const { data } = await axios.get(url);

  if (
    !data ||
    data.result !== "success" ||
    typeof data.conversion_rate !== "number"
  ) {
    throw new Error("Invalid response from FX API");
  }

  return {
    base_code: data.base_code || base,
    target_code: data.target_code || target,
    conversion_rate: data.conversion_rate,
    time_last_update_utc: data.time_last_update_utc,
    time_next_update_utc: data.time_next_update_utc,
    fetchedAt: Date.now(),
  };
}

async function fetchLatestRates(base) {
  const url = `${FX_API_V6_URL}/${FX_API_V6_KEY}/latest/${base}`;
  const { data } = await axios.get(url);
  if (!data || data.result !== "success") {
    throw new Error("Invalid response from FX API");
  }
  return {
    ...data,
    conversion_rates: data.conversion_rates || {},
    fetchedAt: Date.now(),
  };
}

async function getPairRate(base, target) {
  const key = pairKey(base, target);
  const cached = cache.get(key);
  if (isFresh(cached)) {
    return cached;
  }
  const fresh = await fetchPairRate(base, target);
  cache.set(key, fresh);
  persistCache();
  return fresh;
}

async function getLatestRates(base) {
  const key = latestKey(base);
  const cached = cache.get(key);
  if (isFresh(cached)) {
    return cached;
  }
  const fresh = await fetchLatestRates(base);
  cache.set(key, fresh);
  persistCache();
  return fresh;
}

async function getHistoricalRatesForBase(base, quotes, dateStr) {
  const quotesKey = quotes.slice().sort().join("_");
  const key = historicalKey(dateStr, base, quotesKey);
  const cached = cache.get(key);
  if (isFresh(cached)) {
    return cached;
  }

  const symbols = Array.from(
    new Set([...quotes, base !== "EUR" ? base : null].filter(Boolean))
  ).join(",");
  const url = `${HISTORICAL_API_URL}/${dateStr}?access_key=${EXCHANGE_RATES_API_KEY}&symbols=${symbols}`;
  let data;
  try {
    const resp = await axios.get(url);
    data = resp.data;
  } catch (err) {
    throw new Error(`Historical API request failed: ${err.message}`);
  }
  if (!data || !data.rates) {
    throw new Error("Invalid response from historical API");
  }

  const rates = {};
  quotes.forEach((quote) => {
    rates[quote] = calculateCrossRate(data.rates, base, quote);
  });

  const payload = { base, date: dateStr, rates, fetchedAt: Date.now() };
  cache.set(key, payload);
  persistCache();
  return payload;
}

async function preCacheNairaHistory() {
  if (!EXCHANGE_RATES_API_KEY || !FX_API_V6_KEY) return;
  const base = "NGN";
  try {
    const latest = await getLatestRates(base);
    const quotes = Object.keys(latest.conversion_rates || {}).filter(
      (q) => q !== base
    );
    if (!quotes.length) return;

    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() - 1);
    const dateStr = targetDate.toISOString().split("T")[0];

    await getHistoricalRatesForBase(base, quotes, dateStr);
  } catch {
    // ignore pre-cache failures
  }
}

async function refreshCachedEntries() {
  const keys = Array.from(cache.keys());
  await Promise.all(
    keys.map(async (key) => {
      try {
        if (key.startsWith("pair_")) {
          const [, base, target] = key.split("_");
          const fresh = await fetchPairRate(base, target);
          cache.set(key, fresh);
        } else if (key.startsWith("latest_")) {
          const base = key.replace("latest_", "");
          const fresh = await fetchLatestRates(base);
          cache.set(key, fresh);
        }
      } catch {
        // ignore refresh failures
      }
    })
  );
  persistCache();
}

router.get("/fx/rates", async (req, res) => {
  const base = (req.query.base || "NGN").toUpperCase();
  if (!FX_API_V6_KEY) {
    return res.status(500).json({ error: "FX API key missing" });
  }
  try {
    const data = await getLatestRates(base);
    return res.json(data);
  } catch {
    return res.status(502).json({ error: "Failed to fetch rates" });
  }
});

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
  if (!EXCHANGE_RATES_API_KEY) {
    return res.status(500).json({ error: "Historical API key missing" });
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

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split("T")[0];

    const historicalMap = new Map();
    for (const base of bases) {
      const quotes = pairs.filter((p) => p.base === base).map((p) => p.quote);
      const hist = await getHistoricalRatesForBase(base, quotes, yesterdayStr);
      historicalMap.set(base, hist.rates);
    }

    const result = pairs.map(({ base, quote }) => {
      const currentRates = latestMap.get(base) || {};
      const rate = currentRates[quote] ?? null;
      const prevRates = historicalMap.get(base) || {};
      const previousRate = prevRates[quote] ?? null;
      return {
        base,
        quote,
        rate,
        change: calculateChange(rate || 0, previousRate),
      };
    });

    return res.json({ result: "success", pairs: result });
  } catch (error) {
    return res.status(502).json({ error: "Failed to fetch pairs" });
  }
});

router.get("/fx/history", async (req, res) => {
  const base = (req.query.base || "USD").toUpperCase();
  const quote = (req.query.quote || "NGN").toUpperCase();
  const days = Number(req.query.days || "7");

  if (!base || !quote) {
    return res.status(400).json({ error: "base and quote are required" });
  }
  if (!EXCHANGE_RATES_API_KEY) {
    return res.status(500).json({ error: "Historical API key missing" });
  }

  try {
    const dates = [];
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      dates.push(date.toISOString().split("T")[0]);
    }

    const history = [];
    for (const dateStr of dates) {
      const hist = await getHistoricalRatesForBase(base, [quote], dateStr);
      const rate = hist.rates[quote];
      if (rate !== null && rate !== undefined) {
        history.push({ date: dateStr, rate });
      }
    }

    return res.json({
      result: "success",
      base_code: base,
      target_code: quote,
      history,
    });
  } catch (error) {
    console.error(error);
    return res.status(502).json({ error: "Failed to fetch history" });
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
    return res.status(502).json({ error: "Failed to convert currency" });
  }
});

module.exports = {
  router,
  loadCacheFromDisk,
  refreshCachedEntries,
  preCacheNairaHistory,
};
