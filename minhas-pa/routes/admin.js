const express = require('express');
const router = express.Router();
const { User } = require('../models');

const FEATURE_KEYS = ['loans', 'rent', 'bills', 'expenses', 'savings', 'committees', 'investments', 'salary'];

// GET /api/admin/users — everyone except the caller sees full management controls;
// the caller's own row is included too (read-only in the UI) so the count is accurate.
router.get('/users', async (req, res) => {
  try {
    const users = await User.find().sort({ created_at: -1 });
    res.json(users);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load users' });
  }
});

// PATCH /api/admin/users/:id — partial update: any of { role, plan, is_active, disabled_features }
router.patch('/users/:id', async (req, res) => {
  try {
    const targetId = req.params.id;
    if (targetId === req.user.id) {
      return res.status(400).json({ error: "You can't change your own account from here — ask another admin, or edit the database directly." });
    }

    const { role, plan, is_active, disabled_features } = req.body;

    const existing = await User.findById(targetId);
    if (!existing) return res.status(404).json({ error: 'User not found' });

    if (role !== undefined && !['user', 'super_admin'].includes(role)) {
      return res.status(400).json({ error: "role must be 'user' or 'super_admin'" });
    }
    if (plan !== undefined && !['free', 'premium'].includes(plan)) {
      return res.status(400).json({ error: "plan must be 'free' or 'premium'" });
    }
    if (disabled_features !== undefined) {
      if (!Array.isArray(disabled_features)) {
        return res.status(400).json({ error: 'disabled_features must be an array of feature keys' });
      }
      const invalid = disabled_features.filter(f => !FEATURE_KEYS.includes(f));
      if (invalid.length) {
        return res.status(400).json({ error: `Unknown feature key(s): ${invalid.join(', ')}` });
      }
    }

    if (role !== undefined) existing.role = role;
    if (plan !== undefined) existing.plan = plan;
    if (is_active !== undefined) existing.is_active = Boolean(is_active);
    if (disabled_features !== undefined) existing.disabled_features = disabled_features;

    await existing.save();

    res.json(existing);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// GET /api/admin/feature-keys — lets the frontend build its toggle list without hard-coding it twice
router.get('/feature-keys', (req, res) => {
  res.json(FEATURE_KEYS);
});

module.exports = router;
