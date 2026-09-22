// models/User.js
// Mongoose creates the "users" collection automatically the first time a
// document is saved — nothing to run by hand.
const mongoose = require('mongoose');
const { applyIdTransform } = require('./plugin');

const userSchema = new mongoose.Schema({
  full_name: { type: String, required: true, trim: true, maxlength: 80 },
  username: { type: String, required: true, unique: true, trim: true, maxlength: 40 },
  email: { type: String, required: true, unique: true, trim: true, maxlength: 120 },
  password_hash: { type: String, required: true },
  role: { type: String, enum: ['user', 'super_admin'], default: 'user' },
  plan: { type: String, enum: ['free', 'premium'], default: 'free' },
  is_active: { type: Boolean, default: true },
  // Stored as a real array now instead of a comma-joined string — Mongo
  // has no reason to flatten it the way the old NVARCHAR column did.
  disabled_features: { type: [String], default: [] },
  created_at: { type: Date, default: Date.now },
  last_login_at: { type: Date, default: null },
});

applyIdTransform(userSchema);

module.exports = mongoose.model('User', userSchema);
