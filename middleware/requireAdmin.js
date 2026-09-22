// middleware/requireAdmin.js
// Blocks every route it's applied to unless the logged-in user is
// role === 'super_admin'. Must run AFTER requireAuth (needs req.user).
function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Not logged in' });
  }
  if (req.user.role === 'super_admin') {
    return next();
  }
  return res.status(403).json({ error: 'Admins only.' });
}

module.exports = { requireAdmin };
