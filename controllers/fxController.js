const axios = require("axios");
const RateCache = require("../models/RateCache");

axios.defaults.timeout = 15000;

// Common currency pairs to cache automatically
const COMMON_CURRENCY_PAIRS = [
  { base: "USD", target: "NGN" },
  { base: "EUR", target: "NGN" },
  { base: "GBP", target: "NGN" },
  { base: "CAD", target: "NGN" },
];

const FX_API_V6_URL =
  process.env.FX_API_V6_URL || "https://v6.exchangerate-api.com/v6";
const FX_API_V6_KEY = process.env.FX_API_V6_KEY;

const pairKey = (base, target) => `pair_${base}_${target}`;
const latestKey = (base) => `latest_${base}`;

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
  const cached = await RateCache.getCache(key);

  if (RateCache.isFresh(cached)) {
    return {
      ...cached.data,
      change_percent: cached.change_percent,
    };
  }

  const fresh = await fetchPairRate(base, target);
  const currentDate = new Date(fresh.time_last_update_utc)
    .toISOString()
    .split("T")[0];

  // Get previous rate from a different day for change calculation
  const previousCache = await RateCache.findOne({
    key,
    fetchedAt: { $lt: new Date(currentDate).getTime() },
  })
    .sort({ fetchedAt: -1 })
    .limit(1);

  // Calculate change_percent if previous rate exists
  let changePercent = null;
  if (
    previousCache &&
    previousCache.data &&
    previousCache.data.conversion_rate
  ) {
    const oldRate = previousCache.data.conversion_rate;
    const newRate = fresh.conversion_rate;
    changePercent = +(((newRate - oldRate) / oldRate) * 100).toFixed(4);
  }

  await RateCache.setCache(key, fresh, changePercent);

  return {
    ...fresh,
    change_percent: changePercent,
  };
}

async function getLatestRates(base) {
  const key = latestKey(base);
  const cached = await RateCache.getCache(key);

  if (RateCache.isFresh(cached)) {
    return cached.data;
  }

  const fresh = await fetchLatestRates(base);
  await RateCache.setCache(key, fresh);
  return fresh;
}

async function refreshCachedEntries() {
  try {
    const allCached = await RateCache.find({});

    await Promise.all(
      allCached.map(async (entry) => {
        try {
          const key = entry.key;
          if (key.startsWith("pair_")) {
            const [, base, target] = key.split("_");
            const fresh = await fetchPairRate(base, target);
            await RateCache.setCache(key, fresh);
          } else if (key.startsWith("latest_")) {
            const base = key.replace("latest_", "");
            const fresh = await fetchLatestRates(base);
            await RateCache.setCache(key, fresh);
          }
        } catch (err) {
          console.error(
            `Failed to refresh cache for key ${entry.key}:`,
            err.message
          );
        }
      })
    );
    console.log("Cache refresh completed");
  } catch (err) {
    console.error("Cache refresh failed:", err);
  }
}

/**
 * Automatically cache predefined common currency pairs
 * This runs independently of user requests to build historical data
 */
async function cacheCommonPairs() {
  console.log("Starting automated caching of common currency pairs...");

  try {
    let successCount = 0;
    let failCount = 0;

    for (const { base, target } of COMMON_CURRENCY_PAIRS) {
      try {
        const key = pairKey(base, target);

        const fresh = await fetchPairRate(base, target);
        const currentDate = new Date(fresh.time_last_update_utc)
          .toISOString()
          .split("T")[0];

        // Get previous rate from a different day for change calculation
        const previousCache = await RateCache.findOne({
          key,
          fetchedAt: { $lt: new Date(currentDate).getTime() },
        })
          .sort({ fetchedAt: -1 })
          .limit(1);

        // Calculate change_percent if previous rate exists
        let changePercent = null;
        if (
          previousCache &&
          previousCache.data &&
          previousCache.data.conversion_rate
        ) {
          const oldRate = previousCache.data.conversion_rate;
          const newRate = fresh.conversion_rate;
          changePercent = +(((newRate - oldRate) / oldRate) * 100).toFixed(4);
        }

        await RateCache.setCache(key, fresh, changePercent);
        successCount++;
        console.log(
          `✓ Cached ${base}/${target} (change: ${
            changePercent !== null ? changePercent + "%" : "N/A"
          })`
        );
      } catch (err) {
        failCount++;
        console.error(`✗ Failed to cache ${base}/${target}:`, err.message);
      }
    }

    console.log(
      `Automated caching completed: ${successCount} success, ${failCount} failed`
    );
  } catch (err) {
    console.error("Automated caching failed:", err);
  }
}

module.exports = {
  fetchPairRate,
  fetchLatestRates,
  getPairRate,
  getLatestRates,
  refreshCachedEntries,
  cacheCommonPairs,
  pairKey,
  latestKey,
  COMMON_CURRENCY_PAIRS,
};
