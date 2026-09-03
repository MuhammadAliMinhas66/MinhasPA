require('dotenv').config();
const express = require('express');
const path = require('path');
const { connectDB } = require('./db/connection');
require('./models'); // registers every Mongoose schema/collection
const { requireAuth } = require('./middleware/auth');
const { requirePremium } = require('./middleware/requirePremium');
const { requireAdmin } = require('./middleware/requireAdmin');
const { checkUserStatus } = require('./middleware/checkUserStatus');
const { requireFeature } = require('./middleware/requireFeature');

const app = express();
const PORT = process.env.PORT || 3000;

if (!process.env.JWT_SECRET) {
  console.warn('WARNING: JWT_SECRET is not set in .env — set a long random value before hosting this app.');
}
if (!process.env.ENCRYPTION_KEY) {
  console.warn('WARNING: ENCRYPTION_KEY is not set in .env — saving Bill credentials will fail until it is set.');
}
if (!process.env.MONGODB_URI) {
  console.warn('WARNING: MONGODB_URI is not set in .env — defaulting to mongodb://127.0.0.1:27017/MinhasPA');
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Health check — also confirms whether Mongo is actually connected
app.get('/api/health', (req, res) => {
  const { mongoose } = require('./db/connection');
  res.json({
    status: 'ok',
    db_configured: Boolean(process.env.MONGODB_URI),
    db_connected: mongoose.connection.readyState === 1,
  });
});

// Auth routes — register/login are public (that's the point), /me needs a token
app.use('/api/auth', require('./routes/auth'));

// Everything below this line requires a valid JWT — once hosted, nobody can
// read or write your loans/rent/expenses/savings data without logging in.
// checkUserStatus also blocks disabled accounts and loads this user's
// per-feature toggles fresh on every request (not baked into the JWT), so
// admin changes take effect immediately without the user re-logging in.
app.use('/api', requireAuth, checkUserStatus);

// Admin dashboard — super_admin only
app.use('/api/admin', requireAdmin, require('./routes/admin'));

// Feature routes — added one at a time
app.use('/api/loans', requireFeature('loans'), require('./routes/loans'));
app.use('/api/rent', requireFeature('rent'), require('./routes/rent'));
app.use('/api/expenses', requireFeature('expenses'), require('./routes/expenses'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/bills', requireFeature('bills'), require('./routes/bills'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/salary', requireFeature('salary'), require('./routes/salary'));
// NOTE: savings.js applies its own feature checks per sub-route (the
// 'savings' key for savings insights/entries, a separate 'committees' key
// for the committees endpoints) since they're independent features in the
// UI even though they share this router. Don't gate the whole mount with
// a single requireFeature() here — see routes/savings.js.
app.use('/api/savings', require('./routes/savings'));
// Investments is a Premium feature (plan/role gated) AND a toggleable feature
// (admin can additionally switch it off per-user even on Premium).
app.use('/api/investments', requirePremium, requireFeature('investments'), require('./routes/investments'));
app.use('/api/market', requirePremium, require('./routes/market'));

async function start() {
  try {
    await connectDB();
  } catch (err) {
    console.error('Could not connect to MongoDB at startup — will keep retrying on each request:', err.message);
  }
  app.listen(PORT, () => {
    console.log(`Minhas Personal Assistant running at http://localhost:${PORT}`);
  });
}

start();
