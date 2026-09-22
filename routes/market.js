// routes/market.js
// All external market data flows through here. The browser NEVER calls
// Twelve Data / CoinGecko / GoldAPI directly — no API keys reach the client.
const express = require('express');
const router = express.Router();
const marketDataService = require('../services/marketDataService');

// GET /api/market/stocks/search?q=apple
router.get('/stocks/search', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (q.length < 1) return res.json([]);
  try {
    const results = await marketDataService.searchStocks(q);
    res.json(results);
  } catch (err) {
    console.error('Stock search failed:', err.message);
    res.status(502).json({ error: 'Stock search is temporarily unavailable', detail: err.message });
  }
});

// GET /api/market/stocks/:symbol
router.get('/stocks/:symbol', async (req, res) => {
  try {
    const price = await marketDataService.getStockPrice(req.params.symbol.toUpperCase());
    res.json(price);
  } catch (err) {
    res.status(502).json({ error: 'Could not fetch stock price', detail: err.message });
  }
});

// GET /api/market/crypto/search?q=bitcoin
router.get('/crypto/search', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (q.length < 1) return res.json([]);
  try {
    const results = await marketDataService.searchCrypto(q);
    res.json(results);
  } catch (err) {
    console.error('Crypto search failed:', err.message);
    res.status(502).json({ error: 'Crypto search is temporarily unavailable', detail: err.message });
  }
});

// GET /api/market/crypto/:id  (CoinGecko coin id, e.g. "bitcoin")
router.get('/crypto/:id', async (req, res) => {
  try {
    const price = await marketDataService.getCryptoPrice(req.params.id);
    res.json(price);
  } catch (err) {
    res.status(502).json({ error: 'Could not fetch crypto price', detail: err.message });
  }
});

// GET /api/market/gold?unit=tola
router.get('/gold', async (req, res) => {
  const unit = req.query.unit || 'gram';
  try {
    const price = await marketDataService.getGoldPrice(unit);
    res.json(price);
  } catch (err) {
    res.status(502).json({ error: 'Could not fetch gold price', detail: err.message });
  }
});

module.exports = router;
