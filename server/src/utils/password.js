const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const config = require('../config/env');

/** The single place user passwords are hashed, so every hash uses the configured work factor. */
const hashPassword = (plain) => bcrypt.hash(plain, config.bcryptRounds);

/**
 * Dummy hash compared against when a login email is unknown, so the unknown-email path pays the same
 * bcrypt cost as the wrong-password path. It is generated once (lazily, asynchronously) with the
 * configured work factor from a random, never-stored password; the cached promise is reused.
 */
let dummyHash = null;
const getDummyHash = () => {
  if (!dummyHash) dummyHash = hashPassword(crypto.randomBytes(24).toString('base64'));
  return dummyHash;
};

/** Compares `plain` against the user's hash, or against the dummy hash when there is no user. */
const verifyPassword = async (plain, hash) => bcrypt.compare(plain, hash || (await getDummyHash()));

module.exports = { hashPassword, getDummyHash, verifyPassword };
