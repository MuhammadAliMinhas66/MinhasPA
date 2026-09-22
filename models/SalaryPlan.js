const mongoose = require('mongoose');
const { applyIdTransform } = require('./plugin');

const salaryPlanSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  month_year: { type: String, required: true },
  salary: { type: Number, default: 0 },
  calculated_at: { type: Date, default: null },
  updated_at: { type: Date, default: Date.now },
});
salaryPlanSchema.index({ user: 1, month_year: 1 }, { unique: true });

applyIdTransform(salaryPlanSchema);

module.exports = mongoose.model('SalaryPlan', salaryPlanSchema);
