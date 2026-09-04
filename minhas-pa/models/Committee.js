const mongoose = require('mongoose');
const { applyIdTransform } = require('./plugin');

const committeeSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true, maxlength: 80 },
  monthly_amount: { type: Number, required: true },
  members: { type: Number, default: null },
  payout_month: { type: String, default: null },
  started_date: { type: Date, default: null },
  status: { type: String, enum: ['active', 'completed'], default: 'active' },
  created_at: { type: Date, default: Date.now },
});

applyIdTransform(committeeSchema);

module.exports = mongoose.model('Committee', committeeSchema);
