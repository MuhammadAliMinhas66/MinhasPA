const jwt = require('jsonwebtoken');

const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/;

// Protects any route it's applied to — every request must carry a valid
// JWT in the Authorization header ("Bearer <token>"). This is what stops
// a stranger from hitting your API directly once this app is hosted
// publicly, even though the frontend pages themselves also redirect to
// login.html if there's no token in localStorage.
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Not logged in' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    // Reject any token whose sub isn't a real Mongo ObjectId — e.g. a
    // leftover token issued back when this app ran on the old SQL
    // database (integer ids). Same JWT_SECRET across the migration means
    // an old token still verifies fine; this catches it before it ever
    // reaches a query and crashes with a CastError. Treated exactly like
    // an expired session — the user just needs to log in again.
    if (!OBJECT_ID_RE.test(payload.sub)) {
      return res.status(401).json({ error: 'Session expired — please log in again' });
    }

    req.user = { id: payload.sub, username: payload.username, role: payload.role || 'user', plan: payload.plan || 'free' };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Session expired — please log in again' });
  }
}

module.exports = { requireAuth };
