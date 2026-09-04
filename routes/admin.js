const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const {
  User, ActivityLog,
  Loan, Rent, Expense, ExpenseCategory, Setting, Budget,
  Bill, BillCategory, BillCredential, BillPayment,
  Investment, InvestmentPriceHistory,
  SalaryPlan, SalaryItem, SavingsEntry, Committee, CommitteePayment,
} = require('../models');

const FEATURE_KEYS = ['loans', 'rent', 'bills', 'expenses', 'savings', 'committees', 'investments', 'salary'];
const USERNAME_RE = /^[a-zA-Z0-9_]{3,40}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Someone counts as "active right now" if they've made a request (any
// page load, any save) in the last 15 minutes.
const ACTIVE_WINDOW_MS = 15 * 60 * 1000;

// ----- Shared: per-user activity summary (last seen, entries added) -----
// One aggregation covering every user, merged onto the /users response —
// this is what lets the admin panel show who's actually active and who's
// actually adding entries, instead of a manual on/off switch.
async function buildActivitySummaryMap() {
  const rows = await ActivityLog.aggregate([
    {
      $group: {
        _id: '$user',
        last_activity_at: { $max: '$created_at' },
        total_actions: { $sum: 1 },
        entries_added: { $sum: { $cond: [{ $eq: ['$action', 'create'] }, 1, 0] } },
      },
    },
  ]);
  const map = new Map();
  for (const row of rows) {
    if (!row._id) continue;
    map.set(String(row._id), {
      last_activity_at: row.last_activity_at,
      total_actions: row.total_actions,
      entries_added: row.entries_added,
    });
  }
  return map;
}

// GET /api/admin/users — everyone except the caller sees full management controls;
// the caller's own row is included too (read-only in the UI) so the count is accurate.
// Each user now also carries live activity info (last_activity_at, entries_added,
// is_active_now) computed from the activity log, instead of a manually-set flag.
router.get('/users', async (req, res) => {
  try {
    const [users, activityMap] = await Promise.all([
      User.find().sort({ created_at: -1 }),
      buildActivitySummaryMap(),
    ]);

    const now = Date.now();
    const enriched = users.map(u => {
      const json = u.toJSON();
      const activity = activityMap.get(json.id) || { last_activity_at: null, total_actions: 0, entries_added: 0 };
            const isActiveNow = Boolean(
        json.last_seen_at && (now - new Date(json.last_seen_at).getTime()) <= ACTIVE_WINDOW_MS
      );
      return {
        ...json,
        last_activity_at: activity.last_activity_at,
        entries_added: activity.entries_added,
        total_actions: activity.total_actions,
        is_active_now: isActiveNow,
      };
    });

    res.json(enriched);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load users' });
  }
});

// PATCH /api/admin/users/:id — partial update: any of
// { role, plan, disabled_features, full_name, username, email }
router.patch('/users/:id', async (req, res) => {
  try {
    const targetId = req.params.id;
    if (targetId === req.user.id) {
      return res.status(400).json({ error: "You can't change your own account from here — ask another admin, or edit the database directly." });
    }

    const { role, plan, disabled_features, full_name, username, email } = req.body;

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

    let nextUsername = existing.username;
    let nextEmail = existing.email;

    if (full_name !== undefined) {
      const trimmed = String(full_name).trim();
      if (!trimmed) return res.status(400).json({ error: 'Full name cannot be empty' });
      existing.full_name = trimmed.slice(0, 80);
    }
    if (username !== undefined) {
      nextUsername = String(username).trim().toLowerCase();
      if (!USERNAME_RE.test(nextUsername)) {
        return res.status(400).json({ error: 'Username must be 3-40 characters: letters, numbers, underscore only' });
      }
    }
    if (email !== undefined) {
      nextEmail = String(email).trim().toLowerCase();
      if (!EMAIL_RE.test(nextEmail)) {
        return res.status(400).json({ error: 'Enter a valid email address' });
      }
    }
    if (username !== undefined || email !== undefined) {
      const clash = await User.findOne({
        _id: { $ne: targetId },
        $or: [{ username: nextUsername }, { email: nextEmail }],
      }).select('_id');
      if (clash) {
        return res.status(409).json({ error: 'That username or email is already used by another account' });
      }
      existing.username = nextUsername;
      existing.email = nextEmail;
    }

    if (role !== undefined) existing.role = role;
    if (plan !== undefined) existing.plan = plan;
    if (disabled_features !== undefined) existing.disabled_features = disabled_features;

    await existing.save();

    res.json(existing);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// POST /api/admin/users/:id/reset-password
// Body: { new_password?: string } — if omitted, a strong random password
// is generated and returned once in the response so the admin can hand it
// to the user. It is never stored anywhere in plain text, only its bcrypt hash.
router.post('/users/:id/reset-password', async (req, res) => {
  try {
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ error: 'User not found' });

    let { new_password } = req.body || {};
    let generated = false;

    if (new_password !== undefined && new_password !== null && new_password !== '') {
      if (String(new_password).length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
      }
      new_password = String(new_password);
    } else {
      new_password = crypto.randomBytes(9).toString('base64').replace(/[+/=]/g, m => ({ '+': '8', '/': '9', '=': '' }[m]));
      generated = true;
    }

    target.password_hash = await bcrypt.hash(new_password, 12);
    await target.save();

    res.json({
      ok: true,
      generated,
      // Only ever returned on this one response — not stored, not logged.
      new_password: generated ? new_password : undefined,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// DELETE /api/admin/users/:id — permanently deletes the account AND every
// piece of data that belonged to it (loans, rent, bills, expenses,
// savings, committees, investments, salary plans, settings, categories).
// Activity log rows are kept (with the name/email already captured on
// them) so the audit trail survives account deletion.
router.delete('/users/:id', async (req, res) => {
  try {
    const targetId = req.params.id;
    if (targetId === req.user.id) {
      return res.status(400).json({ error: "You can't delete your own account from here." });
    }

    const target = await User.findById(targetId);
    if (!target) return res.status(404).json({ error: 'User not found' });

    const [bills, investments] = await Promise.all([
      Bill.find({ user: targetId }).select('_id'),
      Investment.find({ user: targetId }).select('_id'),
    ]);
    const billIds = bills.map(b => b._id);
    const investmentIds = investments.map(i => i._id);

    await Promise.all([
      Loan.deleteMany({ user: targetId }),
      Rent.deleteMany({ user: targetId }),
      Expense.deleteMany({ user: targetId }),
      ExpenseCategory.deleteMany({ user: targetId }),
      Setting.deleteMany({ user: targetId }),
      Budget.deleteMany({ user: targetId }),
      BillCategory.deleteMany({ user: targetId }),
      BillPayment.deleteMany({ user: targetId }),
      BillCredential.deleteMany({ bill: { $in: billIds } }),
      Bill.deleteMany({ user: targetId }),
      InvestmentPriceHistory.deleteMany({ investment: { $in: investmentIds } }),
      Investment.deleteMany({ user: targetId }),
      SalaryPlan.deleteMany({ user: targetId }),
      SalaryItem.deleteMany({ user: targetId }),
      SavingsEntry.deleteMany({ user: targetId }),
      Committee.deleteMany({ user: targetId }),
      CommitteePayment.deleteMany({ user: targetId }),
    ]);

    await User.deleteOne({ _id: targetId });

    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// GET /api/admin/logs?limit=50&page=1&user=<id>&resource=loans&action=create
// The activity log — every change any user (or admin) has made, newest first.
router.get('/logs', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const filter = {};
    if (req.query.user) filter.user = req.query.user;
    if (req.query.resource) filter.resource = req.query.resource;
    if (req.query.action) filter.action = req.query.action;

    const [logs, total] = await Promise.all([
      ActivityLog.find(filter).sort({ created_at: -1 }).skip((page - 1) * limit).limit(limit),
      ActivityLog.countDocuments(filter),
    ]);

    res.json({ logs, total, page, limit });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load activity log' });
  }
});

// GET /api/admin/feature-keys — lets the frontend build its toggle list without hard-coding it twice
router.get('/feature-keys', (req, res) => {
  res.json(FEATURE_KEYS);
});

module.exports = router;
