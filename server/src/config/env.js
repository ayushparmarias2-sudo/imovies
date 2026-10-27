require('dotenv').config({ quiet: true });

const int = (v, d) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : d;
};
/** Normalises a configured origin to its serialised form (scheme://host[:port], lowercase, no path/slash). Null if not a plain origin. */
const normalizeOrigin = (value) => {
  try {
    const u = new URL(value);
    if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) return null;
    if ((u.pathname !== '/' && u.pathname !== '') || u.search || u.hash) return null;
    return u.origin;
  } catch { return null; }
};
const rawOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(',').map((s) => s.trim()).filter(Boolean);

const env = process.env.NODE_ENV || 'development';
const isProd = env === 'production';

const config = {
  env,
  isProd,
  isTest: env === 'test',
  port: int(process.env.PORT, 5000),
  mongoUri: process.env.MONGO_URI,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: '7d',
  // Exact, normalised allowlist used by CORS, Socket.IO and the CSRF Origin check. Invalid entries are reported by validate().
  clientOrigins: [...new Set(rawOrigins.map(normalizeOrigin).filter(Boolean))],
  invalidClientOrigins: rawOrigins.filter((o) => !normalizeOrigin(o)),
  trustProxy: process.env.TRUST_PROXY === 'true',
  cookie: {
    sameSite: process.env.COOKIE_SAMESITE || (isProd ? 'none' : 'lax'),
    secure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : isProd,
    maxAgeMs: 7 * 24 * 60 * 60 * 1000,
  },
  bcryptRounds: int(process.env.BCRYPT_ROUNDS, 12),
  tzOffsetMinutes: int(process.env.TZ_OFFSET_MINUTES, 330), // IST by default
  booking: {
    holdMinutes: int(process.env.SEAT_HOLD_MINUTES, 10),
    maxSeats: int(process.env.MAX_SEATS_PER_BOOKING, 8),
    cleanupIntervalMs: int(process.env.CLEANUP_INTERVAL_MS, 60000),
  },
  cancelCutoffHours: int(process.env.CANCEL_CUTOFF_HOURS, 2),
  email: { url: process.env.SMTP_URL || '', from: process.env.EMAIL_FROM || 'iMovies <no-reply@imovies.local>' },
  rateLimit: {
    authMax: int(process.env.AUTH_RATE_LIMIT_MAX, 20),
    reserveMax: int(process.env.RESERVE_RATE_LIMIT_MAX, 30),
  },
};

/** Called by server.js / scripts (not on import, so tests can set env first). */
config.validate = () => {
  const problems = [];
  if (!config.mongoUri) problems.push('MONGO_URI is required');
  if (!config.jwtSecret || config.jwtSecret.length < 32) {
    problems.push('JWT_SECRET is required and must be at least 32 characters');
  }
  if (config.invalidClientOrigins.length) {
    problems.push(`CLIENT_ORIGIN must be a comma-separated list of plain origins like https://app.example.com (no path, no wildcard); invalid: ${config.invalidClientOrigins.join(', ')}`);
  }
  if (!config.clientOrigins.length) problems.push('CLIENT_ORIGIN must contain at least one valid origin');
  if (config.cookie.sameSite === 'none' && !config.cookie.secure) {
    problems.push('COOKIE_SAMESITE=none requires COOKIE_SECURE=true');
  }
  if (problems.length) throw new Error(`Invalid environment configuration:\n - ${problems.join('\n - ')}`);
};

module.exports = config;
