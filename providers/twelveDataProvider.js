// providers/twelveDataProvider.js
// Thin wrapper around the Twelve Data API. Free tier: 8 requests/min, 800/day.
// Docs: https://twelvedata.com/docs
const BASE_URL = 'https://api.twelvedata.com';

function apiKey() {
  const key = process.env.TWELVE_DATA_API_KEY;
  if (!key) throw new Error('TWELVE_DATA_API_KEY is not set in .env');
  return key;
}

// Search stocks by name or symbol. Returns [{symbol, name, currency, exchange}]
async function search(query) {
  const url = `${BASE_URL}/symbol_search?symbol=${encodeURIComponent(query)}&apikey=${apiKey()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Twelve Data search failed: ${res.status}`);
  const data = await res.json();
  if (data.status === 'error') throw new Error(data.message || 'Twelve Data search error');

  return (data.data || []).slice(0, 10).map(r => ({
    symbol: r.symbol,
    name: r.instrument_name,
    currency: r.currency,
    exchange: r.exchange,
    type: r.instrument_type,
  }));
}

// Get a real-time-ish quote for a symbol. Returns {symbol, price, currency}
async function getQuote(symbol) {
  const url = `${BASE_URL}/price?symbol=${encodeURIComponent(symbol)}&apikey=${apiKey()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Twelve Data quote failed: ${res.status}`);
  const data = await res.json();
  if (data.status === 'error' || !data.price) throw new Error(data.message || `No price returned for ${symbol}`);

  // Twelve Data's /price endpoint doesn't return currency; /quote does but
  // costs more credits. Default to USD (true for the vast majority of
  // tickers on the free plan — NYSE/NASDAQ). Adjust here if you add
  // non-USD exchanges later.
  return {
    symbol,
    price: parseFloat(data.price),
    currency: 'USD',
  };
}

module.exports = { search, getQuote };
