// services/currencyService.js
// Converts amounts between currencies for display in PKR. Uses the same
// market_prices cache collection (asset_type = 'fx') so we don't hammer
// the FX API either. Free, no-key provider: open.er-api.com.

const { MarketPrice } = require('../models');

const FX_TTL_MINUTES = parseInt(process.env.FX_CACHE_TTL_MINUTES || '10', 10);
const FX_PROVIDER = 'exchangerate';

async function fetchLiveRate(fromCurrency) {
  const res = await fetch(`https://open.er-api.com/v6/latest/${fromCurrency}`);
  if (!res.ok) throw new Error(`FX rate fetch failed: ${res.status}`);
  const data = await res.json();
  if (data.result !== 'success' || !data.rates || !data.rates.PKR) {
    throw new Error('FX provider returned no PKR rate');
  }
  return data.rates.PKR;
}

// Returns { rate, status, fetchedAt } — rate converts 1 unit of `fromCurrency` to PKR.
async function getRateToPKR(fromCurrency) {
  if (fromCurrency === 'PKR') return { rate: 1, status: 'LIVE', fetchedAt: new Date() };

  const row = await MarketPrice.findOne({ provider: FX_PROVIDER, asset_type: 'fx', symbol: fromCurrency });
  const now = new Date();

  if (row && new Date(row.expires_at) > now) {
    return { rate: Number(row.price), status: row.status, fetchedAt: row.fetched_at };
  }

  try {
    const rate = await fetchLiveRate(fromCurrency);
    const expiresAt = new Date(now.getTime() + FX_TTL_MINUTES * 60 * 1000);

    await MarketPrice.findOneAndUpdate(
      { provider: FX_PROVIDER, asset_type: 'fx', symbol: fromCurrency },
      { price: rate, currency: 'PKR', status: 'LIVE', fetched_at: now, expires_at: expiresAt },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return { rate, status: 'LIVE', fetchedAt: now };
  } catch (err) {
    // Provider failed — fall back to the last known rate rather than breaking conversion.
    if (row) {
      await MarketPrice.updateOne({ provider: FX_PROVIDER, asset_type: 'fx', symbol: fromCurrency }, { status: 'STALE' });
      return { rate: Number(row.price), status: 'STALE', fetchedAt: row.fetched_at };
    }
    console.error('FX rate unavailable and no cached fallback:', err.message);
    return { rate: null, status: 'ERROR', fetchedAt: null };
  }
}

// Convert `amount` in `fromCurrency` to PKR. Returns { pkrAmount, rate, status }.
async function toPKR(amount, fromCurrency) {
  const { rate, status } = await getRateToPKR(fromCurrency);
  if (rate === null) return { pkrAmount: null, rate: null, status: 'ERROR' };
  return { pkrAmount: Math.round(amount * rate * 100) / 100, rate, status };
}

module.exports = { getRateToPKR, toPKR };
