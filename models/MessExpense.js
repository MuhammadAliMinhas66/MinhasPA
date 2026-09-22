const mongoose = require('mongoose');
const { applyIdTransform } = require('./plugin');

// Every ingredient bought and every purchased item (gas, disposables,
// spices, whatever) is one row here. category is just a label the UI
// groups by — the total-expense math treats every category the same.
const messExpenseSchema = new mongoose.Schema({
  group: { type: mongoose.Schema.Types.ObjectId, ref: 'MessGroup', required: true, index: true },
  date: { type: String, required: true }, // 'YYYY-MM-DD'
  item_name: { type: String, required: true, trim: true, maxlength: 120 },
  category: { type: String, enum: ['ingredient', 'purchased', 'other'], default: 'ingredient' },
  cost: { type: Number, required: true, min: 0 },
  paid_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  notes: { type: String, default: null, maxlength: 300 },
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  created_at: { type: Date, default: Date.now },
});
messExpenseSchema.index({ group: 1, date: 1 });

applyIdTransform(messExpenseSchema);

module.exports = mongoose.model('MessExpense', messExpenseSchema);
