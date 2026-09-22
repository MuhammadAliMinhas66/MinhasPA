const mongoose = require('mongoose');
const { applyIdTransform } = require('./plugin');

// A "mess" is a group of friends who cook and eat together and want to
// split the daily food cost. One owner creates it; friends join with the
// invite_code from their own accounts, so each person can log their own
// purchases instead of the owner having to enter everything by hand.
const messGroupSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 80 },
  currency: { type: String, default: 'Rs', maxlength: 10 },
  // Short, easy-to-share code (e.g. "MESS-7F3K2Q"). Regeneratable by the
  // owner if it leaks somewhere it shouldn't.
  invite_code: { type: String, required: true, unique: true, index: true },
  status: { type: String, enum: ['active', 'archived'], default: 'active' },
  // The "fund" system: owner sets a fixed amount everyone should chip in
  // (e.g. Rs 1500 each), separate from who-bought-what-ingredient. 0 means
  // no fixed-contribution collection is running for this group.
  contribution_target: { type: Number, default: 0, min: 0 },
  // Bumped by the owner to start a fresh collection round (e.g. next
  // month) without losing the history of who paid in the old round.
  contribution_round: { type: Number, default: 1 },
  created_at: { type: Date, default: Date.now },
});

applyIdTransform(messGroupSchema);

module.exports = mongoose.model('MessGroup', messGroupSchema);
