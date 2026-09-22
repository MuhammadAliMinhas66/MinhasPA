// providers/goldApiProvider.js
// Wraps goldapi.io (https://www.goldapi.io) — free tier: 100 requests/month.
// Returns price per troy ounce in USD; unit conversion to gram/tola/etc.
// happens in services/valuationService.js via utils/unitConversion.js.
const BASE_URL = 'https://www.goldapi.io/api';

function apiKey() {
  const key = process.env.GOLD_API_KEY;
  if (!key) throw new Error('GOLD_API_KEY is not set in .env');
  return key;
}

// Gold price per troy ounce, in USD.
async function getPrice() {
  const res = await fetch(`${BASE_URL}/XAU/USD`, {
    headers: { 'x-access-token': apiKey(), 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`Gold API failed: ${res.status}`);
  const data = await res.json();
  if (!data.price) throw new Error('Gold API returned no price');

  return { symbol: 'XAU', price: data.price, currency: 'USD', unit: 'troy_ounce' };
}

module.exports = { getPrice };
