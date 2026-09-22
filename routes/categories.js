const express = require('express');
const router = express.Router();
const { ExpenseCategory } = require('../models');

function slugify(label) {
  return String(label)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'custom';
}

// Makes sure THIS user has their own set of default categories (seeded
// once, the first time they hit this route — covers accounts created
// before default-seeding existed at registration time). Safety net only.
async function ensureUserHasDefaults(userId) {
  const existing = await ExpenseCategory.exists({ user: userId });
  if (existing) return;

  await ExpenseCategory.insertMany([
    { user: userId, key: 'mobile', label: 'Mobile package', icon: 'ti-device-mobile', color: '#d4a24e', is_default: true },
    { user: userId, key: 'meals', label: 'Meals', icon: 'ti-tools-kitchen-2', color: '#2dd4bf', is_default: true },
    { user: userId, key: 'grocery', label: 'Grocery', icon: 'ti-shopping-cart', color: '#f2a93b', is_default: true },
    { user: userId, key: 'travel', label: 'Travel', icon: 'ti-plane', color: '#7c9eff', is_default: true },
    { user: userId, key: 'family', label: 'Family', icon: 'ti-users', color: '#e5484d', is_default: true },
    { user: userId, key: 'kameti', label: 'Kameti / committee', icon: 'ti-coins', color: '#c084fc', is_default: true },
    { user: userId, key: 'others', label: 'Others', icon: 'ti-dots', color: '#6b6960', is_default: true },
  ]);
}

// GET /api/categories — default categories first, then custom ones A→Z
router.get('/', async (req, res) => {
  try {
    await ensureUserHasDefaults(req.user.id);
    const docs = await ExpenseCategory.find({ user: req.user.id }).sort({ is_default: -1, label: 1 });
    res.json(docs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch categories', detail: err.message });
  }
});

// POST /api/categories — create a new custom category
// body: { label, icon, color } — icon/color are optional; the client sends
// an auto-matched icon/color so the user never has to pick one themselves.
router.post('/', async (req, res) => {
  try {
    const label = (req.body.label || '').trim();
    const icon = (req.body.icon || 'ti-tag').trim();
    const color = (req.body.color || '#d4a24e').trim();

    if (!label) {
      return res.status(400).json({ error: 'label is required' });
    }

    await ensureUserHasDefaults(req.user.id);
    let key = slugify(label);

    // Ensure the key is unique for THIS user — append _2, _3, ... if it collides.
    let n = 2;
    // eslint-disable-next-line no-await-in-loop
    while (await ExpenseCategory.exists({ key, user: req.user.id })) {
      key = `${slugify(label)}_${n}`;
      n += 1;
    }

    const doc = await ExpenseCategory.create({
      user: req.user.id, key, label, icon, color, is_default: false,
    });

    res.status(201).json(doc);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create category', detail: err.message });
  }
});

module.exports = router;
