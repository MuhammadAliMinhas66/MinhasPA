const mongoose = require('mongoose');
const { applyIdTransform } = require('./plugin');

const rentSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  month_year: { type: String, required: true }, // 'YYYY-MM'
  amount: { type: Number, required: true },
  due_date: { type: Date, required: true },
  status: { type: String, enum: ['paid', 'unpaid'], default: 'unpaid' },
  paid_date: { type: Date, default: null },
  paid_by: { type: String, enum: ['me', 'loan'], default: 'me' },
  loan_name: { type: String, default: null, maxlength: 100 },
  notes: { type: String, default: null, maxlength: 300 },
  created_at: { type: Date, default: Date.now },
});
rentSchema.index({ user: 1, month_year: 1 }, { unique: true });

applyIdTransform(rentSchema);

module.exports = mongoose.model('Rent', rentSchema);
