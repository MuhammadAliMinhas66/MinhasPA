const mongoose = require('mongoose');
const { applyIdTransform } = require('./plugin');

// One row per (group, date) — "what are we eating today". items is a
// plain list of dish names ("Chicken karahi", "Daal", "Roti") rather than
// a separate collection, since a day's menu is always edited as a whole
// unit (add/remove a dish) rather than one dish at a time.
const messMenuSchema = new mongoose.Schema({
  group: { type: mongoose.Schema.Types.ObjectId, ref: 'MessGroup', required: true, index: true },
  date: { type: String, required: true }, // 'YYYY-MM-DD'
  items: { type: [String], default: [] },
  notes: { type: String, default: null, maxlength: 300 },
  updated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
});
messMenuSchema.index({ group: 1, date: 1 }, { unique: true });

applyIdTransform(messMenuSchema);

module.exports = mongoose.model('MessMenu', messMenuSchema);
