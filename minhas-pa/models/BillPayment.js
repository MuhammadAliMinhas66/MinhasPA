const mongoose = require('mongoose');
const { applyIdTransform } = require('./plugin');

const billPaymentSchema = new mongoose.Schema({
  bill: { type: mongoose.Schema.Types.ObjectId, ref: 'Bill', required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  month_year: { type: String, required: true },
  amount: { type: Number, default: null },
  extra_charges: { type: Number, default: 0 },
  due_date: { type: Date, required: true },
  status: { type: String, enum: ['pending', 'paid'], default: 'pending' },
  paid_on: { type: Date, default: null },
  paid_through: { type: String, default: null, maxlength: 60 },
  created_at: { type: Date, default: Date.now },
});
billPaymentSchema.index({ bill: 1, month_year: 1 }, { unique: true });

applyIdTransform(billPaymentSchema);

module.exports = mongoose.model('BillPayment', billPaymentSchema);
