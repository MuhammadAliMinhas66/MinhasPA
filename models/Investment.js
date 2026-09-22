const mongoose = require('mongoose');
const { applyIdTransform } = require('./plugin');

const investmentSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: {
    type: String, required: true,
    enum: ['stocks', 'crypto', 'gold', 'property', 'business', 'vehicle', 'bonds', 'cash', 'other'],
  },
  name: { type: String, required: true, maxlength: 150 },
  description: { type: String, default: null, maxlength: 500 },
  invested_amount: { type: Number, default: 0 },
  current_value: { type: Number, required: true },
  quantity: { type: Number, default: null },
  unit: { type: String, default: null, maxlength: 20 },
  purchase_date: { type: Date, default: null },
  status: { type: String, enum: ['active', 'sold'], default: 'active' },
  sold_value: { type: Number, default: null },
  sold_date: { type: Date, default: null },
  notes: { type: String, default: null, maxlength: 1000 },

  // v2 — market pricing / calculated bonds
  symbol: { type: String, default: null, maxlength: 30 },
  provider: { type: String, default: null, maxlength: 20 },
  valuation_mode: { type: String, enum: ['MARKET', 'CALCULATED', 'MANUAL'], default: 'MANUAL' },
  purchase_price: { type: Number, default: null },
  purchase_currency: { type: String, default: 'PKR', maxlength: 6 },
  current_price: { type: Number, default: null },
  current_currency: { type: String, default: 'PKR', maxlength: 6 },
  price_status: { type: String, enum: ['LIVE', 'STALE', 'ERROR', 'MANUAL'], default: 'LIVE' },
  price_updated_at: { type: Date, default: null },
  interest_rate: { type: Number, default: null },
  interest_type: { type: String, enum: ['simple', 'compound', null], default: null },
  maturity_date: { type: Date, default: null },

  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
});
investmentSchema.index({ user: 1, type: 1 });

applyIdTransform(investmentSchema);

module.exports = mongoose.model('Investment', investmentSchema);
