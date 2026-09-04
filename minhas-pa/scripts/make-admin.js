// scripts/make-admin.js
// One-off bootstrap: promotes one user to super_admin. Needed because the
// admin API itself requires an existing super_admin to call it — this
// script is how you create the very first one.
//
// Usage:
//   node scripts/make-admin.js your_username_or_email

require('dotenv').config();
const { connectDB } = require('../db/connection');
const { User } = require('../models');

async function run() {
  const identifier = process.argv[2];
  if (!identifier) {
    console.error('Usage: node scripts/make-admin.js <username_or_email>');
    process.exit(1);
  }

  await connectDB();

  const user = await User.findOneAndUpdate(
    { $or: [{ username: identifier }, { email: identifier }] },
    { role: 'super_admin' },
    { new: true }
  );

  if (!user) {
    console.error(`No user found matching "${identifier}"`);
    process.exit(1);
  }

  console.log(`${user.username} (${user.email}) is now a super_admin.`);
  console.log('Log out and back in for the change to take effect — role is baked into the JWT at login.');
  process.exit(0);
}

run().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
