const mongoose = require('mongoose');
const { applyIdTransform } = require('./plugin');

const savingsEntrySchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  month_year: { type: String, required: true },
  amount: { type: Number, required: true },
  note: { type: String, default: null, maxlength: 200 },
  created_at: { type: Date, default: Date.now },
});

applyIdTransform(savingsEntrySchema);

module.exports = mongoose.model('SavingsEntry', savingsEntrySchema);
