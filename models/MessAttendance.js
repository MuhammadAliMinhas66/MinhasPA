const mongoose = require('mongoose');
const { applyIdTransform } = require('./plugin');

// Every active member is assumed to be eating every day by default — this
// collection only ever holds the EXCEPTIONS (someone was away / skipped a
// meal that day), so marking a day up-to-date never requires pre-creating
// a row for every member first. A row existing here for (group, date,
// member) simply means "exclude this person's head-count for this day".
const messAttendanceSchema = new mongoose.Schema({
  group: { type: mongoose.Schema.Types.ObjectId, ref: 'MessGroup', required: true, index: true },
  date: { type: String, required: true }, // 'YYYY-MM-DD'
  member: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reason: { type: String, default: null, maxlength: 120 },
  created_at: { type: Date, default: Date.now },
});
messAttendanceSchema.index({ group: 1, date: 1, member: 1 }, { unique: true });

applyIdTransform(messAttendanceSchema);

module.exports = mongoose.model('MessAttendance', messAttendanceSchema);
