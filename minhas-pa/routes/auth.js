const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { User, ExpenseCategory } = require('../models');
const { requireAuth } = require('../middleware/auth');

const USERNAME_RE = /^[a-zA-Z0-9_]{3,40}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Slows down brute-force login guessing once this is hosted publicly —
// 10 attempts per 15 minutes per IP, registration gets its own lighter cap.
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false });
const registerLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });

function signToken(user) {
  return jwt.sign(
    { sub: user.id, username: user.username, role: user.role || 'user', plan: user.plan || 'free' },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

// Every brand-new account starts with its own private set of default
// expense categories — never shared with, or visible to, any other user.
// The collection itself needs no setup — Mongoose creates it on first insert.
async function seedDefaultCategories(userId) {
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

// POST /api/auth/register
router.post('/register', registerLimiter, async (req, res) => {
  try {
    let { full_name, username, email, password } = req.body;
    full_name = (full_name || '').trim();
    username = (username || '').trim().toLowerCase();
    email = (email || '').trim().toLowerCase();

    if (!full_name || !username || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    if (!USERNAME_RE.test(username)) {
      return res.status(400).json({ error: 'Username must be 3-40 characters: letters, numbers, underscore only' });
    }
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'Enter a valid email address' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const existing = await User.findOne({ $or: [{ username }, { email }] }).select('_id');
    if (existing) {
      return res.status(409).json({ error: 'That username or email is already registered' });
    }

    // 12 salt rounds — a strong default that's still fast enough for a
    // login form (bcrypt is intentionally slow; that's what makes
    // brute-forcing a stolen hash impractical).
    const passwordHash = await bcrypt.hash(password, 12);

    // Every new account is a plain 'user' — 'super_admin' is never
    // assignable through this public form, only by promoting a row directly.
    const user = await User.create({
      full_name, username, email, password_hash: passwordHash, role: 'user',
    });

    // Give this brand-new account its own private starter categories so
    // the Expenses page works immediately — everything else (loans, rent,
    // expenses, savings, committees, salary, budgets) starts completely empty.
    await seedDefaultCategories(user.id);

    const token = signToken(user);

    res.status(201).json({
      token,
      user: { id: user.id, full_name: user.full_name, username: user.username, email: user.email, role: user.role, plan: user.plan }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// POST /api/auth/login
router.post('/login', loginLimiter, async (req, res) => {
  try {
    let { identifier, password } = req.body; // identifier = username OR email
    identifier = (identifier || '').trim().toLowerCase();

    if (!identifier || !password) {
      return res.status(400).json({ error: 'Username/email and password are required' });
    }

    const user = await User.findOne({ $or: [{ username: identifier }, { email: identifier }] });

    // Same generic error whether the user doesn't exist or the password is
    // wrong — never reveal which one it was, that's an account-enumeration leak.
    if (!user) {
      return res.status(401).json({ error: 'Invalid username/email or password' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid username/email or password' });
    }

    if (user.is_active === false) {
      return res.status(403).json({ error: 'Your account has been disabled. Contact your admin.', code: 'ACCOUNT_DISABLED' });
    }

    user.last_login_at = new Date();
    await user.save();

    const token = signToken(user);

    res.json({
      token,
      user: {
        id: user.id, full_name: user.full_name, username: user.username, email: user.email,
        role: user.role, plan: user.plan, disabled_features: user.disabled_features || [],
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// GET /api/auth/me — used by the frontend to validate a stored token,
// re-fill the "logged in as" bit in the sidebar, AND (this is the part
// that actually matters) tell every page — fresh, on every load — whether
// this account is disabled or which features an admin has switched off.
// The JWT itself is only re-issued at login, so without this endpoint a
// user who got a feature disabled mid-session could still open that page
// with a stale client-side "user" object and never know it was blocked.
router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (user.is_active === false) {
      return res.status(403).json({ error: 'Your account has been disabled. Contact your admin.', code: 'ACCOUNT_DISABLED' });
    }

    res.json({
      user: {
        id: user.id, full_name: user.full_name, username: user.username, email: user.email,
        role: user.role, plan: user.plan, disabled_features: user.disabled_features || [],
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load profile' });
  }
});

module.exports = router;
