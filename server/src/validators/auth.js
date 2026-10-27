const { z } = require('./common');
const email = z.string().trim().toLowerCase().email('Enter a valid email').max(254);
const password = z.string().min(8, 'Password must be at least 8 characters').max(72)
  .regex(/[A-Za-z]/, 'Password must contain a letter').regex(/\d/, 'Password must contain a number');

exports.register = { body: z.object({ name: z.string().trim().min(2).max(80), email, password }) }; // unknown keys (e.g. role) are stripped
exports.login = { body: z.object({ email, password: z.string().min(1).max(72) }) };
