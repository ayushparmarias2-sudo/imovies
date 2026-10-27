const config = require('../config/env');
const { connectDb } = require('../config/db');
const mongoose = require('mongoose');
const ensureAdmin = require('./ensureAdmin');

(async () => {
  config.validate();
  await connectDb();
  const r = await ensureAdmin();
  console.log(r.skipped ? 'Set ADMIN_EMAIL and ADMIN_PASSWORD to create an admin.' : `Admin ${r.created ? 'created' : 'already exists (left unchanged)'}: ${r.email}`);
  await mongoose.disconnect();
})().catch(async (e) => {
  console.error(`create-admin failed: ${e.message}`); // messages never contain passwords or hashes
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
