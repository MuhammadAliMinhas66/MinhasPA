const mongoose = require('mongoose');
const { applyIdTransform } = require('./plugin');

// One row per (group, user). A member is "active" once they join with the
// invite code; leaving/removal flips status rather than deleting the row,
// so past menu/expense/attendance history they're linked to still makes
// sense to read later.
const messMemberSchema = new mongoose.Schema({
  group: { type: mongoose.Schema.Types.ObjectId, ref: 'MessGroup', required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  role: { type: String, enum: ['owner', 'member'], default: 'member' },
  status: { type: String, enum: ['active', 'left', 'removed'], default: 'active' },
  joined_at: { type: Date, default: Date.now },
});
messMemberSchema.index({ group: 1, user: 1 }, { unique: true });

applyIdTransform(messMemberSchema);

module.exports = mongoose.model('MessMember', messMemberSchema);
