const mongoose = require('mongoose');
const { applyIdTransform } = require('./plugin');

const budgetSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  category: { type: String, required: true, maxlength: 40 },
  monthly_limit: { type: Number, required: true },
  updated_at: { type: Date, default: Date.now },
});
budgetSchema.index({ user: 1, category: 1 }, { unique: true });

applyIdTransform(budgetSchema);

module.exports = mongoose.model('Budget', budgetSchema);
