// middleware/checkUserStatus.js
// Runs right after requireAuth on every /api request. JWTs are only
// re-issued at login, so a disabled account or a freshly-toggled feature
// flag would otherwise not take effect until the user logs out and back
// in — this makes admin actions apply immediately instead.
const { User } = require('../models');

const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/;

async function checkUserStatus(req, res, next) {
  try {
    // NOTE: mongoose.Types.ObjectId.isValid() is deliberately NOT used
    // here — it's overly permissive and returns true for plain numbers
    // too (e.g. isValid(4) === true), which is exactly the leftover
    // integer-id case this guard exists to catch. A strict 24-char hex
    // check is what we actually want.
    if (!OBJECT_ID_RE.test(req.user.id)) {
      return res.status(401).json({ error: 'Account not found', code: 'ACCOUNT_NOT_FOUND' });
    }

    const user = await User.findById(req.user.id).select('is_active disabled_features');
    if (!user) {
      return res.status(401).json({ error: 'Account not found', code: 'ACCOUNT_NOT_FOUND' });
    }
    if (user.is_active === false) {
      return res.status(403).json({ error: 'Your account has been disabled. Contact your admin.', code: 'ACCOUNT_DISABLED' });
    }

    req.user.disabledFeatures = user.disabled_features || [];

    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not verify account status' });
  }
}

module.exports = { checkUserStatus };
