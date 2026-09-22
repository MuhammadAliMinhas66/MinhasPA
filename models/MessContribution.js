const mongoose = require('mongoose');
const { applyIdTransform } = require('./plugin');

// One row per time someone hands over money toward the group's fixed
// contribution (e.g. their Rs 1500 for this round). The owner records
// these as cash comes in — this is separate from MessExpense, which is
// what the fund gets spent on.
const messContributionSchema = new mongoose.Schema({
  group: { type: mongoose.Schema.Types.ObjectId, ref: 'MessGroup', required: true, index: true },
  member: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  amount: { type: Number, required: true, min: 0 },
  date: { type: String, required: true }, // 'YYYY-MM-DD'
  round: { type: Number, required: true }, // snapshot of group.contribution_round at the time
  notes: { type: String, default: null, maxlength: 200 },
  recorded_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  created_at: { type: Date, default: Date.now },
});
messContributionSchema.index({ group: 1, round: 1 });

applyIdTransform(messContributionSchema);

module.exports = mongoose.model('MessContribution', messContributionSchema);
