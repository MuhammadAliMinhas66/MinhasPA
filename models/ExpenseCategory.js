const mongoose = require('mongoose');
const { applyIdTransform } = require('./plugin');

const expenseCategorySchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  key: { type: String, required: true, maxlength: 40 },
  label: { type: String, required: true, maxlength: 60 },
  icon: { type: String, default: 'ti-tag', maxlength: 40 },
  color: { type: String, default: '#d4a24e', maxlength: 10 },
  is_default: { type: Boolean, default: false },
  created_at: { type: Date, default: Date.now },
});
expenseCategorySchema.index({ user: 1, key: 1 }, { unique: true });

applyIdTransform(expenseCategorySchema);

module.exports = mongoose.model('ExpenseCategory', expenseCategorySchema);
