const express = require('express');
const router = express.Router();
const { Setting } = require('../models');

// GET /api/settings — returns everything as a flat { key: value } object,
// scoped to the logged-in user only.
router.get('/', async (req, res) => {
  try {
    const docs = await Setting.find({ user: req.user.id }).select('setting_key setting_value');
    const obj = {};
    docs.forEach(row => { obj[row.setting_key] = row.setting_value; });
    res.json(obj);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// PUT /api/settings — body: { key, value }. Upserts, scoped to this user.
router.put('/', async (req, res) => {
  try {
    const { key, value } = req.body;
    if (!key) return res.status(400).json({ error: 'key is required' });

    await Setting.findOneAndUpdate(
      { user: req.user.id, setting_key: key },
      { setting_value: String(value), updated_at: new Date() },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.json({ key, value });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save setting' });
  }
});

module.exports = router;
