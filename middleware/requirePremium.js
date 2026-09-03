// middleware/requirePremium.js
// Blocks free-plan users from paid features. Must run AFTER requireAuth
// (needs req.user already populated). super_admin always passes, regardless
// of plan — useful for support/testing without needing to flip a flag.
function requirePremium(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Not logged in' });
  }
  if (req.user.role === 'super_admin' || req.user.plan === 'premium') {
    return next();
  }
  return res.status(403).json({
    error: 'This is a Premium feature. Upgrade your plan to unlock Investments.',
    code: 'PREMIUM_REQUIRED',
  });
}

module.exports = { requirePremium };
