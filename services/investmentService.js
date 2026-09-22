// services/investmentService.js
// Pure DB access for investments. Routes call this instead of running
// queries inline, and valuationService/marketDataService stay unaware of
// the storage layer entirely.

const { Investment, InvestmentPriceHistory } = require('../models');

const VALID_TYPES = ['stocks', 'crypto', 'gold', 'property', 'business', 'vehicle', 'bonds', 'cash', 'other'];

const VALUATION_MODE_BY_TYPE = {
  stocks: 'MARKET',
  crypto: 'MARKET',
  gold: 'MARKET',
  bonds: 'CALCULATED',
  property: 'MANUAL',
  business: 'MANUAL',
  vehicle: 'MANUAL',
  cash: 'MANUAL',
  other: 'MANUAL',
};

function isValidType(type) {
  return VALID_TYPES.includes(type);
}

function valuationModeFor(type) {
  return VALUATION_MODE_BY_TYPE[type] || 'MANUAL';
}

async function findAllForUser(userId, { type, status } = {}) {
  const filter = { user: userId };
  if (type) filter.type = type;
  if (status) filter.status = status;
  const docs = await Investment.find(filter).sort({ updated_at: -1 });
  return docs.map(d => d.toJSON());
}

async function findById(id, userId) {
  const doc = await Investment.findOne({ _id: id, user: userId });
  return doc ? doc.toJSON() : null;
}

async function create(userId, data) {
  const valuationMode = valuationModeFor(data.type);
  const doc = await Investment.create({
    user: userId,
    type: data.type,
    name: data.name,
    description: data.description || null,
    symbol: data.symbol || null,
    provider: data.provider || null,
    valuation_mode: valuationMode,
    invested_amount: data.invested_amount || 0,
    current_value: data.current_value || 0,
    quantity: data.quantity || null,
    unit: data.unit || null,
    purchase_price: data.purchase_price || null,
    purchase_currency: data.purchase_currency || 'PKR',
    current_price: data.current_price || null,
    current_currency: data.current_currency || 'PKR',
    purchase_date: data.purchase_date || null,
    status: data.status || 'active',
    sold_value: data.sold_value || null,
    sold_date: data.sold_date || null,
    interest_rate: data.interest_rate || null,
    interest_type: data.interest_type || null,
    maturity_date: data.maturity_date || null,
    notes: data.notes || null,
  });
  return doc.toJSON();
}

async function update(id, userId, data) {
  const valuationMode = valuationModeFor(data.type);
  const set = {
    type: data.type,
    name: data.name,
    description: data.description || null,
    symbol: data.symbol || null,
    provider: data.provider || null,
    valuation_mode: valuationMode,
    invested_amount: data.invested_amount || 0,
    quantity: data.quantity || null,
    unit: data.unit || null,
    purchase_price: data.purchase_price || null,
    purchase_currency: data.purchase_currency || 'PKR',
    purchase_date: data.purchase_date || null,
    status: data.status || 'active',
    sold_value: data.sold_value || null,
    sold_date: data.sold_date || null,
    interest_rate: data.interest_rate || null,
    interest_type: data.interest_type || null,
    maturity_date: data.maturity_date || null,
    notes: data.notes || null,
    updated_at: new Date(),
  };
  if (data.current_value !== undefined) set.current_value = data.current_value;

  const doc = await Investment.findOneAndUpdate({ _id: id, user: userId }, set, { new: true, runValidators: true });
  return doc ? doc.toJSON() : null;
}

// Updates just the live-price fields — used after a successful market refresh.
// NEVER touches invested_amount/purchase_price (purchase history is immutable).
async function updateMarketPrice(id, userId, { currentPrice, currentCurrency, currentValue, priceStatus }) {
  const doc = await Investment.findOneAndUpdate(
    { _id: id, user: userId },
    {
      current_price: currentPrice, current_currency: currentCurrency,
      current_value: currentValue, price_status: priceStatus,
      price_updated_at: new Date(), updated_at: new Date(),
    },
    { new: true, runValidators: true }
  );
  return doc ? doc.toJSON() : null;
}

async function updateManualValue(id, userId, currentValue) {
  const doc = await Investment.findOneAndUpdate(
    { _id: id, user: userId },
    { current_value: currentValue, updated_at: new Date() },
    { new: true, runValidators: true }
  );
  return doc ? doc.toJSON() : null;
}

async function remove(id, userId) {
  const result = await Investment.findOneAndDelete({ _id: id, user: userId });
  return !!result;
}

async function recordPriceHistory(investmentId, price, currency, valuePkr, source) {
  await InvestmentPriceHistory.create({
    investment: investmentId, price: price || 0, currency: currency || 'PKR', value_pkr: valuePkr, source,
  });
}

module.exports = {
  VALID_TYPES, VALUATION_MODE_BY_TYPE,
  isValidType, valuationModeFor,
  findAllForUser, findById, create, update,
  updateMarketPrice, updateManualValue, remove, recordPriceHistory,
};
