const mongoose = require('mongoose');
const { applyIdTransform } = require('./plugin');

const billCategorySchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  key: { type: String, required: true, maxlength: 40 },
  label: { type: String, required: true, maxlength: 60 },
  icon: { type: String, default: 'ti-file-invoice', maxlength: 40 },
  color: { type: String, default: '#d4a24e', maxlength: 10 },
  is_default: { type: Boolean, default: false },
  created_at: { type: Date, default: Date.now },
});
billCategorySchema.index({ user: 1, key: 1 }, { unique: true });

applyIdTransform(billCategorySchema);

module.exports = mongoose.model('BillCategory', billCategorySchema);
