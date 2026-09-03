const mongoose = require('mongoose');
const { applyIdTransform } = require('./plugin');

const settingSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  setting_key: { type: String, required: true, maxlength: 50 },
  setting_value: { type: String, required: true, maxlength: 200 },
  updated_at: { type: Date, default: Date.now },
});
settingSchema.index({ user: 1, setting_key: 1 }, { unique: true });

applyIdTransform(settingSchema);

module.exports = mongoose.model('Setting', settingSchema);
