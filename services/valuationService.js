// services/valuationService.js
// Turns an investment row (+ live market price, where relevant) into the
// numbers the UI shows: current_value, profit/loss, profit %. All monetary
// math is done in PKR after currency conversion. We round only at the final
// display step to avoid compounding rounding error.

const currencyService = require('./currencyService');
const marketDataService = require('./marketDataService');

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function profitLoss(currentValue, investedAmount) {
  const pl = currentValue - investedAmount;
  const plPct = investedAmount > 0 ? round2((pl / investedAmount) * 100) : null;
  return { profitLoss: round2(pl), profitLossPct: plPct };
}

// MARKET mode: stocks, crypto, gold. Fetches live price, converts to PKR.
async function valueMarketInvestment(inv) {
  let priceResult;

  if (inv.type === 'stocks') {
    priceResult = await marketDataService.getStockPrice(inv.symbol);
  } else if (inv.type === 'crypto') {
    priceResult = await marketDataService.getCryptoPrice(inv.symbol);
  } else if (inv.type === 'gold') {
    priceResult = await marketDataService.getGoldPrice(inv.unit || 'gram');
  } else {
    throw new Error(`valueMarketInvestment called for non-market type: ${inv.type}`);
  }

  if (priceResult.status === 'ERROR' || priceResult.price === null) {
    // Never return zero — fall back to whatever was last stored on the row itself.
    const fallbackValue = Number(inv.current_value) || 0;
    const { profitLoss: pl, profitLossPct } = profitLoss(fallbackValue, Number(inv.invested_amount));
    return {
      currentPrice: inv.current_price ? Number(inv.current_price) : null,
      currentCurrency: inv.current_currency || 'USD',
      currentValue: fallbackValue,
      profitLoss: pl,
      profitLossPct,
      priceStatus: 'ERROR',
      priceUpdatedAt: inv.price_updated_at,
    };
  }

  const quantity = Number(inv.quantity) || 0;
  const { pkrAmount, status: fxStatus } = await currencyService.toPKR(priceResult.price * quantity, priceResult.currency);
  const finalStatus = fxStatus === 'ERROR' ? 'STALE' : priceResult.status;
  const currentValue = pkrAmount !== null ? pkrAmount : Number(inv.current_value) || 0;

  const { profitLoss: pl, profitLossPct } = profitLoss(currentValue, Number(inv.invested_amount));

  return {
    currentPrice: priceResult.price,
    currentCurrency: priceResult.currency,
    currentValue,
    profitLoss: pl,
    profitLossPct,
    priceStatus: finalStatus,
    priceUpdatedAt: priceResult.fetchedAt,
  };
}

// CALCULATED mode: Bonds/FD. Accrues interest from purchase_date to today
// (or maturity_date, whichever is earlier), simple or compound.
function valueCalculatedInvestment(inv) {
  const principal = Number(inv.invested_amount);
  const rate = Number(inv.interest_rate) / 100;
  const start = inv.purchase_date ? new Date(inv.purchase_date) : null;
  const maturity = inv.maturity_date ? new Date(inv.maturity_date) : null;
  const today = new Date();
  const end = maturity && maturity < today ? maturity : today;

  let currentValue = principal;

  if (start && rate > 0) {
    const years = Math.max(0, (end - start) / (365.25 * 24 * 60 * 60 * 1000));
    currentValue = inv.interest_type === 'compound'
      ? principal * Math.pow(1 + rate, years)
      : principal * (1 + rate * years);
  }

  currentValue = round2(currentValue);
  const { profitLoss: pl, profitLossPct } = profitLoss(currentValue, principal);

  return {
    currentPrice: null,
    currentCurrency: 'PKR',
    currentValue,
    profitLoss: pl,
    profitLossPct,
    priceStatus: 'MANUAL', // "calculated", not a live market feed — UI should label it as such
    priceUpdatedAt: new Date(),
  };
}

// MANUAL mode: property, business, vehicle, cash, other. Uses whatever the
// user last typed into current_value — no external calls.
function valueManualInvestment(inv) {
  const currentValue = Number(inv.current_value) || 0;
  const { profitLoss: pl, profitLossPct } = profitLoss(currentValue, Number(inv.invested_amount));
  return {
    currentPrice: null,
    currentCurrency: 'PKR',
    currentValue,
    profitLoss: pl,
    profitLossPct,
    priceStatus: 'MANUAL',
    priceUpdatedAt: inv.updated_at,
  };
}

// Entry point — dispatches by valuation_mode. `liveRefresh=false` skips
// external calls for MARKET investments and just uses the last stored
// current_price/current_value (used for fast list rendering; the dedicated
// refresh endpoint is what actually hits providers).
async function valuate(inv, { liveRefresh = false } = {}) {
  if (inv.valuation_mode === 'MARKET') {
    if (liveRefresh) return valueMarketInvestment(inv);
    // Cheap path: reuse whatever's already stored, just recompute P/L.
    const currentValue = Number(inv.current_value) || 0;
    const { profitLoss: pl, profitLossPct } = profitLoss(currentValue, Number(inv.invested_amount));
    return {
      currentPrice: inv.current_price ? Number(inv.current_price) : null,
      currentCurrency: inv.current_currency || 'USD',
      currentValue,
      profitLoss: pl,
      profitLossPct,
      priceStatus: inv.price_status || 'STALE',
      priceUpdatedAt: inv.price_updated_at,
    };
  }
  if (inv.valuation_mode === 'CALCULATED') return valueCalculatedInvestment(inv);
  return valueManualInvestment(inv);
}

module.exports = { valuate, valueMarketInvestment, round2, profitLoss };
