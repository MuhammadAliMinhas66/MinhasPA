// providers/coinGeckoProvider.js
// CoinGecko public API. Free tier works without a key (rate-limited ~10-30
// calls/min); if COINGECKO_API_KEY is set (a "Demo" key from CoinGecko), we
// use the paid-tier-friendly header for higher limits.
const BASE_URL = 'https://api.coingecko.com/api/v3';

function headers() {
  const key = process.env.COINGECKO_API_KEY;
  return key ? { 'x-cg-demo-api-key': key } : {};
}

// Search coins by name/symbol. Returns [{id, symbol, name}]
// `id` (e.g. "bitcoin") is the stable identifier to store — never the display name.
async function search(query) {
  const url = `${BASE_URL}/search?query=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) throw new Error(`CoinGecko search failed: ${res.status}`);
  const data = await res.json();

  return (data.coins || []).slice(0, 10).map(c => ({
    id: c.id,
    symbol: c.symbol.toUpperCase(),
    name: c.name,
  }));
}

// Get current price for a CoinGecko coin id, in USD.
async function getPrice(coinId) {
  const url = `${BASE_URL}/simple/price?ids=${encodeURIComponent(coinId)}&vs_currencies=usd`;
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) throw new Error(`CoinGecko price failed: ${res.status}`);
  const data = await res.json();
  const entry = data[coinId];
  if (!entry || entry.usd === undefined) throw new Error(`No price returned for ${coinId}`);

  return { symbol: coinId, price: entry.usd, currency: 'USD' };
}

module.exports = { search, getPrice };
