// middleware/requireFeature.js
// Blocks a feature route if an admin has switched it off for this specific
// user (independent of the Premium/plan gating in requirePremium.js).
// Must run after checkUserStatus.js (needs req.user.disabledFeatures).
function requireFeature(key) {
  return (req, res, next) => {
    if (req.user.role === 'super_admin') return next(); // admins are never locked out of their own app
    if (req.user.disabledFeatures && req.user.disabledFeatures.includes(key)) {
      return res.status(403).json({
        error: 'This feature has been disabled for your account. Contact your admin.',
        code: 'FEATURE_DISABLED',
      });
    }
    next();
  };
}

module.exports = { requireFeature };
