const mongoose = require('mongoose');
const { applyIdTransform } = require('./plugin');

const investmentPriceHistorySchema = new mongoose.Schema({
  investment: { type: mongoose.Schema.Types.ObjectId, ref: 'Investment', required: true, index: true },
  price: { type: Number, required: true },
  currency: { type: String, required: true, maxlength: 6 },
  value_pkr: { type: Number, required: true },
  recorded_at: { type: Date, default: Date.now },
  source: { type: String, required: true, maxlength: 20 },
});
investmentPriceHistorySchema.index({ investment: 1, recorded_at: 1 });

applyIdTransform(investmentPriceHistorySchema);

module.exports = mongoose.model('InvestmentPriceHistory', investmentPriceHistorySchema);
