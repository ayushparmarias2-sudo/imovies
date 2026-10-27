const rateLimit = require('express-rate-limit');
const config = require('../config/env');
const ApiError = require('../utils/ApiError');
const { COOKIE } = require('../utils/token');

const limiter = (limit, windowMs, message) =>
  rateLimit({ windowMs, limit, standardHeaders: 'draft-7', legacyHeaders: false, message: { success: false, message } });

exports.authLimiter = limiter(config.rateLimit.authMax, 15 * 60 * 1000, 'Too many attempts. Please try again later.');
exports.reserveLimiter = limiter(config.rateLimit.reserveMax, 60 * 1000, 'Too many reservation requests. Slow down.');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF defence for cookie authentication (no CSRF token; see README "CSRF model").
 *
 *  - Safe methods (GET/HEAD/OPTIONS) are never blocked. They must not change state.
 *  - Any unsafe method that carries Origin must carry an EXACT match from the CLIENT_ORIGIN allowlist
 *    (compared as normalised origin strings, so "https://app.example.com.evil.test" or "null" never match).
 *  - An unsafe method that carries the auth cookie MUST carry an allowed Origin. Browsers always send Origin on
 *    cross-origin POST/PUT/PATCH/DELETE and on same-origin fetch() calls of those methods; a cookie-bearing unsafe
 *    request without Origin is therefore not a legitimate browser request from our frontend and is rejected.
 *  - An unsafe request with neither Origin nor the auth cookie has no ambient credential to abuse (the API accepts no
 *    other credential type), so scripts and health probes such as curl can still call public endpoints
 *    (login/register) and will simply get 401 on protected ones.
 * Authentication/authorisation is separate and always runs afterwards (middleware/auth.js).
 */
exports.originCheck = (req, res, next) => {
  if (SAFE_METHODS.has(req.method)) return next();
  const origin = req.get('origin');
  if (origin !== undefined) {
    return config.clientOrigins.includes(origin) ? next() : next(new ApiError(403, 'Origin not allowed'));
  }
  if (req.cookies && req.cookies[COOKIE]) return next(new ApiError(403, 'Origin header required for this request'));
  next();
};
