const mongoose = require('mongoose');
const { applyIdTransform } = require('./plugin');

const loanSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  direction: { type: String, enum: ['given', 'taken'], required: true },
  person_name: { type: String, required: true, maxlength: 100 },
  amount: { type: Number, required: true },
  description: { type: String, default: null, maxlength: 500 },
  date_taken: { type: Date, required: true },
  due_date: { type: Date, default: null },
  status: { type: String, enum: ['pending', 'done'], default: 'pending' },
  created_at: { type: Date, default: Date.now },
});

applyIdTransform(loanSchema);

module.exports = mongoose.model('Loan', loanSchema);
