const mongoose = require("mongoose");

const rateCacheSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      index: true,
    },
    data: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    fetchedAt: {
      type: Number,
      required: true,
      default: () => Date.now(),
    },
    timeNextUpdateUtc: {
      type: Date,
      index: true,
    },
    change_percent: {
      type: Number,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

rateCacheSchema.index({ key: 1, fetchedAt: -1 });

rateCacheSchema.statics.getCache = async function (key) {
  return await this.findOne({ key }).sort({ fetchedAt: -1 });
};

rateCacheSchema.statics.setCache = async function (
  key,
  data,
  changePercent = null
) {
  const timeNextUpdateUtc = data.time_next_update_utc
    ? new Date(data.time_next_update_utc)
    : null;

  return await this.create({
    key,
    data,
    fetchedAt: Date.now(),
    timeNextUpdateUtc,
    change_percent: changePercent,
  });
};

rateCacheSchema.statics.isFresh = function (cacheEntry) {
  if (!cacheEntry) return false;

  const data = cacheEntry.data;

  if (data.time_next_update_utc) {
    const nextUpdate = new Date(data.time_next_update_utc).getTime();
    if (Date.now() < nextUpdate) return true;
  }

  const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
  if (cacheEntry.fetchedAt) {
    return Date.now() - cacheEntry.fetchedAt < CACHE_TTL_MS;
  }

  return false;
};

const RateCache = mongoose.model("RateCache", rateCacheSchema);

module.exports = RateCache;
