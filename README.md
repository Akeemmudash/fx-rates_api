# FX Rates API

## Overview

A comprehensive foreign exchange rates API that provides real-time and historical currency conversion data. Built with Express.js and MongoDB, featuring automated caching, historical data tracking, and daily rate change calculations.

**Data Source**: [exchangerate-api.com](https://v6.exchangerate-api.com/v6)

## Prerequisites

1. **Node.js** (v14 or higher)
2. **MongoDB** (local instance or MongoDB Atlas account)
3. **Exchange Rate API Key** from [exchangerate-api.com](https://www.exchangerate-api.com/)

## MongoDB Setup

### Option 1: MongoDB Atlas (Cloud - Free Tier)

1. Create a free account at [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Create a new cluster (free M0 tier available)
3. Create a database user with read/write permissions
4. Get your connection string (should look like: `mongodb+srv://username:password@cluster.mongodb.net/fx-rates`)

### Option 2: Local MongoDB

1. Install MongoDB locally: `brew install mongodb-community` (macOS)
2. Start MongoDB: `brew services start mongodb-community`
3. Your connection string will be: `mongodb://localhost:27017/fx-rates`

## Installation

1. **Fix npm permissions** (if you encounter EACCES errors):

   ```bash
   sudo chown -R $(whoami) ~/.npm
   ```

2. **Install dependencies:**

   ```bash
   npm install
   ```

3. **Configure environment variables:**

   - Copy `.env.example` to `.env`:
     ```bash
     cp .env.example .env
     ```
   - Update the following variables in `.env`:
     ```
     PORT=3000
     FX_API_V6_URL=https://v6.exchangerate-api.com/v6
     FX_API_V6_KEY=your_actual_api_key_here
     MONGODB_URI=your_mongodb_connection_string_here
     ```

4. **Start the server:**
   ```bash
   npm start
   ```

## API Endpoints

### GET /fx/rates

Get latest exchange rates for a base currency.

**Query Parameters:**

- `base` (optional): Base currency code (default: "NGN")

**Example:**

```bash
curl "http://localhost:3000/fx/rates?base=USD"
```

**Response:**

```json
{
  "result": "success",
  "base_code": "USD",
  "conversion_rates": {
    "EUR": 0.85,
    "GBP": 0.73,
    "NGN": 1453.28
  },
  "time_last_update_utc": "Sat, 04 Jan 2026 00:00:00 +0000"
}
```

---

### GET /fx/pair

Get conversion rate for a specific currency pair with daily change percentage.

**Query Parameters:**

- `base` (optional): Base currency code (default: "USD")
- `target` (optional): Target currency code (default: "NGN")
- `amount` (optional): Amount to convert (default: "1")

**Example:**

```bash
curl "http://localhost:3000/fx/pair?base=USD&target=NGN&amount=100"
```

**Response:**

```json
{
  "result": "success",
  "pair": {
    "base_code": "USD",
    "target_code": "NGN",
    "conversion_rate": 1453.285,
    "conversion_result": 145328.5,
    "change_percent": 0.11,
    "time_last_update_utc": "Sat, 04 Jan 2026 00:00:00 +0000",
    "time_next_update_utc": "Sun, 05 Jan 2026 00:00:00 +0000"
  }
}
```

---

### GET /fx/pairs

Get multiple currency pairs with current rates in a single request.

**Query Parameters:**

- `pairs` (required): Comma-separated list of pairs in format `BASE:QUOTE`

**Example:**

```bash
curl "http://localhost:3000/fx/pairs?pairs=USD:NGN,EUR:GBP,GBP:USD"
```

**Response:**

```json
{
  "result": "success",
  "pairs": [
    { "base": "USD", "quote": "NGN", "rate": 1453.285 },
    { "base": "EUR", "quote": "GBP", "rate": 0.86 },
    { "base": "GBP", "quote": "USD", "rate": 1.37 }
  ]
}
```

---

### GET /fx/convert

Convert an amount from one currency to another with change tracking.

**Query Parameters:**

- `base` (optional): Base currency code (default: "USD")
- `target` (optional): Target currency code (default: "NGN")
- `amount` (required): Amount to convert

**Example:**

```bash
curl "http://localhost:3000/fx/convert?base=USD&target=NGN&amount=50"
```

**Response:**

```json
{
  "result": "success",
  "base_code": "USD",
  "target_code": "NGN",
  "amount": 50,
  "conversion_rate": 1453.285,
  "conversion_result": 72664.25,
  "change_percent": 0.11,
  "time_last_update_utc": "Sat, 04 Jan 2026 00:00:00 +0000",
  "time_next_update_utc": "Sun, 05 Jan 2026 00:00:00 +0000"
}
```

---

### GET /fx/history

Get historical exchange rate data for a currency pair over a specified time period.

**Query Parameters:**

- `base` (optional): Base currency code (default: "USD")
- `quote` (optional): Target currency code (default: "NGN")
- `days` (optional): Number of days of history (1-365, default: "7")

**Example:**

```bash
curl "http://localhost:3000/fx/history?base=USD&quote=NGN&days=30"
```

**Response:**

```json
{
  "result": "success",
  "base_code": "USD",
  "target_code": "NGN",
  "days_requested": 30,
  "data_points": 30,
  "history": [
    {
      "date": "2025-12-05",
      "rate": 1445.2,
      "change_percent": -0.15,
      "fetchedAt": 1733356800000,
      "time_last_update_utc": "Thu, 05 Dec 2025 00:00:00 GMT"
    },
    {
      "date": "2025-12-06",
      "rate": 1447.85,
      "change_percent": 0.18,
      "fetchedAt": 1733443200000,
      "time_last_update_utc": "Fri, 06 Dec 2025 00:00:00 GMT"
    }
  ]
}
```

## Features

- ✅ **Historical Data Tracking**: All exchange rates stored in MongoDB with timestamps for historical analysis
- ✅ **Automatic Change Calculation**: Daily percentage change calculated automatically by comparing with previous rates
- ✅ **Smart Caching**: Rates cached for 24 hours based on API update schedule
- ✅ **Automated Daily Caching**: Cron job runs daily at 1 AM to cache common currency pairs (USD, EUR, GBP, CAD to NGN)
- ✅ **Multiple Endpoints**: Support for single pairs, multiple pairs, conversion, and historical data
- ✅ **MongoDB Persistence**: Full historical rate data with indexed queries for fast retrieval

## Automated Caching

The API automatically caches common currency pairs daily to build historical data:

**Cached Pairs:**

- USD/NGN
- EUR/NGN
- GBP/NGN
- CAD/NGN

**Schedule:** Daily at 1:00 AM (configurable in `index.js`)

This ensures historical data is available independent of user requests.

## Database Schema

The `RateCache` collection stores all rate data with the following fields:

- `key`: Cache key (e.g., `pair_USD_NGN`, `latest_USD`)
- `data`: Complete rate data from the API
- `fetchedAt`: Timestamp when the data was cached
- `timeNextUpdateUtc`: Next update time from the API
- `change_percent`: Daily percentage change (calculated automatically)
- `createdAt`, `updatedAt`: Mongoose timestamps

**Indexes:**

- `{ key: 1, fetchedAt: -1 }` - Fast retrieval of latest rates
- `{ key: 1 }` - Quick lookups by cache key
- `{ timeNextUpdateUtc: 1 }` - Efficient cache expiration checks

Multiple entries can exist for the same key, enabling complete historical tracking.
