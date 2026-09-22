const express = require('express');
const router = express.Router();
const investmentService = require('../services/investmentService');
const valuationService = require('../services/valuationService');
const currencyService = require('../services/currencyService');

const { VALID_TYPES, isValidType } = investmentService;

// GET /api/investments?type=crypto&status=active
// Fast path — uses whatever price is already stored (no external calls).
// Call POST /api/investments/refresh-prices first (or use the Refresh button)
// to bring MARKET holdings up to date.
router.get('/', async (req, res) => {
  try {
    const { type, status } = req.query;
    const rows = await investmentService.findAllForUser(req.user.id, { type, status });

    const withValuation = await Promise.all(rows.map(async (inv) => {
      const val = await valuationService.valuate(inv, { liveRefresh: false });
      return { ...inv, ...toApiShape(val) };
    }));

    res.json(withValuation);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch investments' });
  }
});

// GET /api/investments/summary
router.get('/summary', async (req, res) => {
  try {
    const active = await investmentService.findAllForUser(req.user.id, { status: 'active' });
    const sold = await investmentService.findAllForUser(req.user.id, { status: 'sold' });

    const valuedActive = await Promise.all(active.map(async (inv) => {
      const val = await valuationService.valuate(inv, { liveRefresh: false });
      return { ...inv, ...toApiShape(val) };
    }));

    const totalInvested = round2sum(valuedActive.map(i => Number(i.invested_amount)));
    const totalCurrentValue = round2sum(valuedActive.map(i => Number(i.current_value)));
    const totalGainLoss = round2(totalCurrentValue - totalInvested);

    const byTypeMap = {};
    for (const inv of valuedActive) {
      if (!byTypeMap[inv.type]) byTypeMap[inv.type] = { type: inv.type, invested: 0, current_value: 0, count: 0 };
      byTypeMap[inv.type].invested += Number(inv.invested_amount);
      byTypeMap[inv.type].current_value += Number(inv.current_value);
      byTypeMap[inv.type].count += 1;
    }

    const soldInvested = round2sum(sold.map(i => Number(i.invested_amount)));
    const soldValue = round2sum(sold.map(i => Number(i.sold_value || 0)));

    res.json({
      total_invested: totalInvested,
      total_current_value: totalCurrentValue,
      total_gain_loss: totalGainLoss,
      total_gain_loss_pct: totalInvested > 0 ? round2((totalGainLoss / totalInvested) * 100) : null,
      holding_count: valuedActive.length,
      by_type: Object.values(byTypeMap).map(t => ({ ...t, invested: round2(t.invested), current_value: round2(t.current_value) })),
      realized: {
        total_invested: soldInvested,
        total_sold_value: soldValue,
        realized_gain_loss: round2(soldValue - soldInvested),
        count: sold.length,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to build investments summary' });
  }
});

// POST /api/investments/refresh-prices
// Refreshes live prices for ALL of this user's active MARKET-mode holdings.
// This is the ONLY route that triggers external provider calls in bulk —
// and even this goes through the shared cache, so concurrent users hitting
// "refresh" don't multiply API calls per symbol.
router.post('/refresh-prices', async (req, res) => {
  try {
    const rows = await investmentService.findAllForUser(req.user.id, { status: 'active' });
    const marketRows = rows.filter(r => r.valuation_mode === 'MARKET');

    const results = await Promise.all(marketRows.map(async (inv) => {
      try {
        const val = await valuationService.valueMarketInvestment(inv);
        const updated = await investmentService.updateMarketPrice(inv.id, req.user.id, {
          currentPrice: val.currentPrice,
          currentCurrency: val.currentCurrency,
          currentValue: val.currentValue,
          priceStatus: val.priceStatus,
        });
        if (updated) {
          await investmentService.recordPriceHistory(inv.id, val.currentPrice, val.currentCurrency, val.currentValue, inv.provider || 'market');
        }
        return { id: inv.id, name: inv.name, status: val.priceStatus };
      } catch (err) {
        console.error(`Refresh failed for investment ${inv.id}:`, err.message);
        return { id: inv.id, name: inv.name, status: 'ERROR' };
      }
    }));

    res.json({ refreshed: results.length, results });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to refresh prices' });
  }
});

// POST /api/investments/:id/refresh — refresh a single holding
router.post('/:id/refresh', async (req, res) => {
  try {
    const inv = await investmentService.findById(req.params.id, req.user.id);
    if (!inv) return res.status(404).json({ error: 'Investment not found' });
    if (inv.valuation_mode !== 'MARKET') {
      return res.status(400).json({ error: 'Only MARKET-valued investments (stocks, crypto, gold) can be refreshed' });
    }

    const val = await valuationService.valueMarketInvestment(inv);
    const updated = await investmentService.updateMarketPrice(inv.id, req.user.id, {
      currentPrice: val.currentPrice,
      currentCurrency: val.currentCurrency,
      currentValue: val.currentValue,
      priceStatus: val.priceStatus,
    });
    await investmentService.recordPriceHistory(inv.id, val.currentPrice, val.currentCurrency, val.currentValue, inv.provider || 'market');

    res.json({ ...updated, ...toApiShape(val) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to refresh price' });
  }
});

// POST /api/investments
router.post('/', async (req, res) => {
  try {
    const data = req.body;
    if (!data.type || !isValidType(data.type)) {
      return res.status(400).json({ error: `type must be one of: ${VALID_TYPES.join(', ')}` });
    }
    if (!data.name) return res.status(400).json({ error: 'name is required' });

    const prepared = await prepareForSave(data);
    if (prepared.error) return res.status(400).json({ error: prepared.error });

    const created = await investmentService.create(req.user.id, prepared.data);
    res.status(201).json(created);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create investment' });
  }
});

// PUT /api/investments/:id
router.put('/:id', async (req, res) => {
  try {
    const data = req.body;
    if (!data.type || !isValidType(data.type)) {
      return res.status(400).json({ error: `type must be one of: ${VALID_TYPES.join(', ')}` });
    }

    const prepared = await prepareForSave(data);
    if (prepared.error) return res.status(400).json({ error: prepared.error });

    const updated = await investmentService.update(req.params.id, req.user.id, prepared.data);
    if (!updated) return res.status(404).json({ error: 'Investment not found' });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update investment' });
  }
});

// PATCH /api/investments/:id/value — manual value update (property, business, vehicle, cash, other)
router.patch('/:id/value', async (req, res) => {
  try {
    const { current_value } = req.body;
    if (current_value === undefined || current_value === null) {
      return res.status(400).json({ error: 'current_value is required' });
    }

    const inv = await investmentService.findById(req.params.id, req.user.id);
    if (!inv) return res.status(404).json({ error: 'Investment not found' });
    if (inv.valuation_mode === 'MARKET') {
      return res.status(400).json({ error: 'This holding uses live market pricing — use Refresh instead of a manual value.' });
    }

    const updated = await investmentService.updateManualValue(req.params.id, req.user.id, current_value);
    await investmentService.recordPriceHistory(inv.id, null, 'PKR', current_value, 'manual');
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update value' });
  }
});

// DELETE /api/investments/:id
router.delete('/:id', async (req, res) => {
  try {
    const ok = await investmentService.remove(req.params.id, req.user.id);
    if (!ok) return res.status(404).json({ error: 'Investment not found' });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete investment' });
  }
});

// ===== helpers =====

// Shapes a valuationService result into the field names the frontend expects.
function toApiShape(val) {
  return {
    current_price: val.currentPrice,
    current_currency: val.currentCurrency,
    current_value: val.currentValue,
    gain_loss: val.profitLoss,
    gain_loss_pct: val.profitLossPct,
    price_status: val.priceStatus,
    price_updated_at: val.priceUpdatedAt,
  };
}

function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }
function round2sum(arr) { return round2(arr.reduce((a, b) => a + b, 0)); }

// For MARKET-mode creates/edits, current_value/price aren't user-entered —
// they get filled in by the first refresh. invested_amount = quantity * purchase_price.
// For CALCULATED (bonds/FD), current_value is computed, not stored blindly.
// For MANUAL, current_value comes straight from the form.
async function prepareForSave(data) {
  const valuationMode = investmentService.valuationModeFor(data.type);
  const out = { ...data };

  if (valuationMode === 'MARKET') {
    if (!data.symbol) return { error: 'symbol is required for stocks, crypto, and gold' };
    const quantity = parseFloat(data.quantity) || 0;
    const purchasePrice = parseFloat(data.purchase_price) || 0;
    const purchaseCurrency = data.purchase_currency || 'USD';

    // invested_amount must be in PKR to compare against current_value (also
    // PKR) — converting only one side of the gain/loss math was the bug
    // that made a $63k Bitcoin buy show as a 27,000% gain.
    const rawInvested = round2(quantity * purchasePrice);
    const { pkrAmount, status: fxStatus } = await currencyService.toPKR(rawInvested, purchaseCurrency);
    out.invested_amount = pkrAmount !== null ? pkrAmount : rawInvested;
    out.purchase_price = purchasePrice;   // original per-unit price, kept as-entered for the record
    out.purchase_currency = purchaseCurrency;
    if (pkrAmount === null) {
      return { error: `Could not convert ${purchaseCurrency} to PKR right now — check your internet connection and try again.` };
    }
    // current_value/current_price get set by the refresh endpoint, not here.
    out.current_value = data.current_value || out.invested_amount;
  } else if (valuationMode === 'CALCULATED') {
    if (!data.invested_amount) return { error: 'Principal (invested amount) is required for Bonds/FD' };
    out.current_value = data.invested_amount; // recalculated on every GET via valuationService
  } else {
    if (data.current_value === undefined || data.current_value === null) {
      return { error: 'current_value is required' };
    }
  }

  return { data: out };
}

module.exports = router;
