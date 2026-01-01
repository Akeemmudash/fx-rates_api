const axios = require("axios");
const RateCache = require("../models/RateCache");

axios.defaults.timeout = 15000;

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
    return cached.data;
  }

  const fresh = await fetchPairRate(base, target);
  await RateCache.setCache(key, fresh);
  return fresh;
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

module.exports = {
  fetchPairRate,
  fetchLatestRates,
  getPairRate,
  getLatestRates,
  refreshCachedEntries,
  pairKey,
  latestKey,
};
