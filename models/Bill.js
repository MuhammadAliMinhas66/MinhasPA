const mongoose = require('mongoose');
const { applyIdTransform } = require('./plugin');

const billSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  category_key: { type: String, required: true, maxlength: 40 },
  biller_name: { type: String, required: true, maxlength: 120 },
  due_day: { type: Number, required: true, min: 1, max: 31 },
  default_amount: { type: Number, default: null },
  is_fixed_amount: { type: Boolean, default: false },
  notes: { type: String, default: null, maxlength: 300 },
  is_active: { type: Boolean, default: true },
  created_at: { type: Date, default: Date.now },
});

applyIdTransform(billSchema);

module.exports = mongoose.model('Bill', billSchema);
