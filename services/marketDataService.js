// services/marketDataService.js
// Cache-first market price lookup. This is the ONLY place that decides
// whether to call an external provider — routes/controllers never call
// providers directly. If 100 users own AAPL, this results in ONE external
// call (per TTL window), not 100.

const { MarketPrice } = require('../models');
const twelveData = require('../providers/twelveDataProvider');
const coinGecko = require('../providers/coinGeckoProvider');
const goldApi = require('../providers/goldApiProvider');
const { toTroyOunces } = require('../utils/unitConversion');

const TTL_MINUTES = {
  stocks: parseInt(process.env.STOCK_CACHE_TTL_MINUTES || '5', 10),
  crypto: parseInt(process.env.CRYPTO_CACHE_TTL_MINUTES || '1', 10),
  gold: parseInt(process.env.GOLD_CACHE_TTL_MINUTES || '1', 10),
};

async function getCachedRow(provider, assetType, symbol) {
  return MarketPrice.findOne({ provider, asset_type: assetType, symbol });
}

async function saveCachedPrice(provider, assetType, symbol, price, currency, status, ttlMinutes) {
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);
  await MarketPrice.findOneAndUpdate(
    { provider, asset_type: assetType, symbol },
    { price, currency, status, fetched_at: new Date(), expires_at: expiresAt },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

async function markStale(provider, assetType, symbol) {
  await MarketPrice.updateOne({ provider, asset_type: assetType, symbol }, { status: 'STALE' });
}

// Generic cache-or-fetch. `fetchFn` must return { price, currency }.
// Returns { price, currency, status: LIVE|STALE|ERROR, fetchedAt }.
async function getPriceWithCache(provider, assetType, symbol, ttlMinutes, fetchFn) {
  const cached = await getCachedRow(provider, assetType, symbol);
  const now = new Date();

  if (cached && new Date(cached.expires_at) > now && cached.status === 'LIVE') {
    return { price: Number(cached.price), currency: cached.currency, status: 'LIVE', fetchedAt: cached.fetched_at };
  }

  try {
    const { price, currency } = await fetchFn();
    await saveCachedPrice(provider, assetType, symbol, price, currency, 'LIVE', ttlMinutes);
    return { price, currency, status: 'LIVE', fetchedAt: now };
  } catch (err) {
    console.error(`[marketDataService] ${provider}/${symbol} fetch failed:`, err.message);
    if (cached) {
      // Last known good price — never zero it out, never delete it.
      await markStale(provider, assetType, symbol);
      return { price: Number(cached.price), currency: cached.currency, status: 'STALE', fetchedAt: cached.fetched_at };
    }
    return { price: null, currency: null, status: 'ERROR', fetchedAt: null };
  }
}

function getStockPrice(symbol) {
  return getPriceWithCache('twelvedata', 'stocks', symbol, TTL_MINUTES.stocks, async () => {
    const q = await twelveData.getQuote(symbol);
    return { price: q.price, currency: q.currency };
  });
}

function getCryptoPrice(coinId) {
  return getPriceWithCache('coingecko', 'crypto', coinId, TTL_MINUTES.crypto, async () => {
    const q = await coinGecko.getPrice(coinId);
    return { price: q.price, currency: q.currency };
  });
}

// Gold price per the given unit (gram/tola/ounce/kilogram), cached per-unit
// so the conversion math doesn't need to happen on every cache hit.
function getGoldPrice(unit) {
  return getPriceWithCache('goldapi', 'gold', unit, TTL_MINUTES.gold, async () => {
    const q = await goldApi.getPrice(); // USD per troy ounce
    const ouncesPerUnit = toTroyOunces(1, unit);
    return { price: q.price * ouncesPerUnit, currency: 'USD' };
  });
}

async function searchStocks(query) {
  return twelveData.search(query);
}

async function searchCrypto(query) {
  return coinGecko.search(query);
}

module.exports = {
  getStockPrice,
  getCryptoPrice,
  getGoldPrice,
  searchStocks,
  searchCrypto,
};
