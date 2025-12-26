const express = require('express')
const fs = require('fs')
const path = require('path')

const router = express.Router()

const TIPS_FILE = path.join(__dirname, '..', 'data', 'tips.json')

function loadTips() {
  try {
    const raw = fs.readFileSync(TIPS_FILE, 'utf-8')
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      return parsed
    }
  } catch {
    // ignore and fall back
  }
  return []
}

const tips = loadTips()

function pickTipForDate(dateKey) {
  const fallback =
    'Set aside ₦500 daily for emergencies. Small amounts add up to big savings over time!'
  if (!tips.length) return fallback

  let hash = 0
  for (let i = 0; i < dateKey.length; i += 1) {
    hash = (hash * 31 + dateKey.charCodeAt(i)) >>> 0
    console.log('hash', hash)
  }

  return tips[hash % tips.length]
}

router.get('/tips', (req, res) => {
  const amount = Math.max(1, Number(req.query.amount) || 500)
  const rounded = Math.round(amount)
  const placeholder = `${rounded}`
  const dateKey = new Date().toISOString().split('T')[0] 

  const rawTip = pickTipForDate(dateKey)
  const tip = rawTip.replace(/\{amount\}/g, placeholder)

  res.json({ result: 'success', tip })
})

module.exports = { router }
