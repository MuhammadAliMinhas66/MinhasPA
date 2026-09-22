const mongoose = require('mongoose');
const { applyIdTransform } = require('./plugin');

const salaryItemSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  plan: { type: mongoose.Schema.Types.ObjectId, ref: 'SalaryPlan', required: true, index: true },
  label: { type: String, required: true, maxlength: 80 },
  amount: { type: Number, required: true },
  icon: { type: String, default: 'ti-tag', maxlength: 40 },
  color: { type: String, default: '#d4a24e', maxlength: 10 },
  sort_order: { type: Number, default: 0 },
  source: { type: String, default: null, maxlength: 30 },
  detail: { type: String, default: null, maxlength: 500 },
  created_at: { type: Date, default: Date.now },
});

applyIdTransform(salaryItemSchema);

module.exports = mongoose.model('SalaryItem', salaryItemSchema);
