const { User } = require('../models');
const { hashPassword } = require('../utils/password');
const { register } = require('../validators/auth');

/** Raised when bootstrap must not proceed. The message is safe to print: it never contains secrets or hashes. */
class AdminBootstrapError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'AdminBootstrapError';
    this.code = code;
  }
}

const isDuplicateKey = (e) => e && (e.code === 11000 || (e.cause && e.cause.code === 11000));

/**
 * Fail-closed, idempotent bootstrap of the FIRST admin from ADMIN_EMAIL / ADMIN_PASSWORD (never hardcoded).
 *
 *  - no account for the email        -> create an ADMIN with a freshly hashed password
 *  - account exists and is ADMIN     -> do nothing (no role, password or other credential is touched)
 *  - account exists and is CUSTOMER  -> abort; the account is NOT promoted and its password hash is NOT changed.
 *    Anyone could have self-registered that address before bootstrap ran, so promoting it would hand admin
 *    rights to whoever knows that account's password. An operator must resolve it deliberately (see message).
 *
 * Concurrency: the unique index on User.email is the arbiter. If two bootstraps race, one create wins and the
 * other gets a duplicate-key error, which is resolved by re-reading the winner's role (ADMIN -> idempotent success).
 * There is intentionally no API endpoint that calls this: it is only reachable by someone who can run code on the server.
 */
module.exports = async function ensureAdmin() {
  const { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME } = process.env;
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return { skipped: true };

  // Same normalisation and password policy as public registration (trim + lowercase, 8-72 chars, letter + digit).
  const parsed = register.body.safeParse({ name: ADMIN_NAME || 'iMovies Admin', email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((i) => String(i.path[0])))];
    const reasons = parsed.error.issues.map((i) => `${i.path[0]}: ${i.message}`).join('; ');
    throw new AdminBootstrapError('INVALID_CONFIG', `Invalid admin bootstrap configuration (${fields.map((f) => (f === 'email' ? 'ADMIN_EMAIL' : f === 'password' ? 'ADMIN_PASSWORD' : 'ADMIN_NAME')).join(', ')}). ${reasons}`);
  }
  const { email, name, password } = parsed.data;

  const conflict = (found) => new AdminBootstrapError(
    'ADMIN_EMAIL_NOT_ADMIN',
    `An account for ${email} already exists with role ${found.role}, so it was NOT promoted and its credentials were NOT changed. ` +
    'Public registration could have created it, so promoting it automatically is unsafe. ' +
    'Resolve it deliberately: set ADMIN_EMAIL to a different, unused address and re-run, or - if you control this account ' +
    'and it holds no data you need - delete it directly in the database and re-run.'
  );

  const existing = await User.findOne({ email }).select('role').lean(); // never loads passwordHash
  if (existing) {
    if (existing.role === 'ADMIN') return { email, created: false };
    throw conflict(existing);
  }

  try {
    await User.create({ name, email, role: 'ADMIN', passwordHash: await hashPassword(password) });
    return { email, created: true };
  } catch (e) {
    if (!isDuplicateKey(e)) throw e;
    // Lost a race (another bootstrap, or a customer registering the same email). Decide from the committed winner.
    const winner = await User.findOne({ email }).select('role').lean();
    if (winner && winner.role === 'ADMIN') return { email, created: false };
    if (winner) throw conflict(winner);
    throw e;
  }
};
module.exports.AdminBootstrapError = AdminBootstrapError;
