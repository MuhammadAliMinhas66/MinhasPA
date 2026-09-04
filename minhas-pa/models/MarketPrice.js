const mongoose = require('mongoose');
const { applyIdTransform } = require('./plugin');

// One cached price per (provider, asset_type, symbol) — shared across ALL
// users, so 100 users holding AAPL means 1 external API call, not 100.
const marketPriceSchema = new mongoose.Schema({
  provider: { type: String, required: true, maxlength: 20 },
  asset_type: { type: String, required: true, maxlength: 20 },
  symbol: { type: String, required: true, maxlength: 30 },
  price: { type: Number, required: true },
  currency: { type: String, required: true, maxlength: 6 },
  status: { type: String, enum: ['LIVE', 'STALE', 'ERROR'], default: 'LIVE' },
  fetched_at: { type: Date, default: Date.now },
  expires_at: { type: Date, required: true },
});
marketPriceSchema.index({ provider: 1, asset_type: 1, symbol: 1 }, { unique: true });
marketPriceSchema.index({ asset_type: 1, symbol: 1 });

applyIdTransform(marketPriceSchema);

module.exports = mongoose.model('MarketPrice', marketPriceSchema);
