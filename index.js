require('dotenv').config()
const express = require('express')
const cors = require('cors')
const cron = require('node-cron')

const { router: fxRouter, loadCacheFromDisk, refreshCachedEntries, preCacheNairaHistory } = require('./routes/fx')
const { router: tipsRouter } = require('./routes/tips')


const app = express()
app.use(cors())
app.use(express.json())

const PORT = process.env.PORT || 3000

loadCacheFromDisk()
cron.schedule('0 0 * * *', refreshCachedEntries)
cron.schedule('30 0 * * *', preCacheNairaHistory)

app.use(fxRouter)
app.use(tipsRouter)

app.listen(PORT, () => {
  console.log(`FX rates API running on port ${PORT}`)
})
