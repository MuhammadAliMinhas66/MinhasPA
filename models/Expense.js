const mongoose = require('mongoose');
const { applyIdTransform } = require('./plugin');

const expenseSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  category: { type: String, required: true, maxlength: 40 },
  amount: { type: Number, required: true },
  expense_date: { type: Date, required: true },
  paid_by: { type: String, enum: ['me', 'other'], default: 'me' },
  payer_name: { type: String, default: null, maxlength: 100 },
  note: { type: String, default: null, maxlength: 300 },
  status: { type: String, enum: ['paid', 'unpaid'], default: 'paid' },
  linked_loan_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Loan', default: null },
  created_at: { type: Date, default: Date.now },
});

applyIdTransform(expenseSchema);

module.exports = mongoose.model('Expense', expenseSchema);
