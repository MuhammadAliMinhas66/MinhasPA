// models/ActivityLog.js
// Every create/update/delete a logged-in user makes anywhere in the app
// (loans, rent, bills, expenses, savings, committees, investments, salary,
// settings, categories) — and every account change an admin makes — gets
// one row here. Written automatically by middleware/activityLogger.js;
// nothing in the individual route files has to call this directly.
const mongoose = require('mongoose');
const { applyIdTransform } = require('./plugin');

const activityLogSchema = new mongoose.Schema({
  // Kept even if the user is later deleted, so the log entry still reads
  // sensibly — that's why full_name/username/email are duplicated onto
  // the log row instead of only being looked up live via `user`.
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  full_name: { type: String, default: '' },
  username: { type: String, default: '' },
  email: { type: String, default: '' },

  action: { type: String, enum: ['create', 'update', 'delete'], required: true },
  resource: { type: String, required: true, maxlength: 40 }, // e.g. 'loans', 'expenses', 'admin-users'
  resource_id: { type: String, default: null },
  method: { type: String, required: true, maxlength: 10 },
  path: { type: String, required: true, maxlength: 200 },
  summary: { type: String, default: '', maxlength: 200 },
  status_code: { type: Number, required: true },

  created_at: { type: Date, default: Date.now, index: true },
});

activityLogSchema.index({ user: 1, created_at: -1 });

applyIdTransform(activityLogSchema);

module.exports = mongoose.model('ActivityLog', activityLogSchema);
