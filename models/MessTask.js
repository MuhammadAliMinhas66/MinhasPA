const mongoose = require('mongoose');
const { applyIdTransform } = require('./plugin');

// One row per duty for a given day — "who's cooking today", "who's doing
// the dishes", "who's bringing groceries". task_name is free text so the
// group can invent whatever duties they actually use, not a fixed list.
const messTaskSchema = new mongoose.Schema({
  group: { type: mongoose.Schema.Types.ObjectId, ref: 'MessGroup', required: true, index: true },
  date: { type: String, required: true }, // 'YYYY-MM-DD'
  task_name: { type: String, required: true, trim: true, maxlength: 60 },
  assigned_to: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  status: { type: String, enum: ['pending', 'done'], default: 'pending' },
  notes: { type: String, default: null, maxlength: 200 },
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  created_at: { type: Date, default: Date.now },
});
messTaskSchema.index({ group: 1, date: 1 });

applyIdTransform(messTaskSchema);

module.exports = mongoose.model('MessTask', messTaskSchema);
