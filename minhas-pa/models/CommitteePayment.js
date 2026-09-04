const mongoose = require('mongoose');
const { applyIdTransform } = require('./plugin');

const committeePaymentSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  committee: { type: mongoose.Schema.Types.ObjectId, ref: 'Committee', required: true, index: true },
  month_year: { type: String, required: true },
  status: { type: String, enum: ['paid', 'unpaid'], default: 'unpaid' },
  paid_date: { type: Date, default: null },
  payment_method: { type: String, default: null, maxlength: 30 },
  paid_by_other: { type: Boolean, default: false },
  payer_name: { type: String, default: null, maxlength: 100 },
  reimbursed: { type: Boolean, default: false },
  reimbursed_date: { type: Date, default: null },
  created_at: { type: Date, default: Date.now },
});
committeePaymentSchema.index({ committee: 1, month_year: 1 }, { unique: true });

applyIdTransform(committeePaymentSchema);

module.exports = mongoose.model('CommitteePayment', committeePaymentSchema);
