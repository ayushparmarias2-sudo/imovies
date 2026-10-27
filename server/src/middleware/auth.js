const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { COOKIE, verifyToken } = require('../utils/token');
const { User } = require('../models');

async function loadUser(req) {
  const token = req.cookies && req.cookies[COOKIE];
  if (!token) return null;
  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    throw new ApiError(401, 'Session is invalid or has expired. Please log in again.');
  }
  const user = await User.findById(payload.sub);
  if (!user || !user.isActive) throw new ApiError(401, 'Account not found or disabled');
  return user;
}

exports.protect = asyncHandler(async (req, res, next) => {
  const user = await loadUser(req);
  if (!user) throw new ApiError(401, 'Authentication required');
  req.user = user;
  next();
});

/** Attaches req.user when a valid session exists; never fails the request. */
exports.optionalAuth = asyncHandler(async (req, res, next) => {
  try { req.user = await loadUser(req); } catch { req.user = null; }
  next();
});

exports.restrictTo = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : next(new ApiError(403, 'You do not have permission to perform this action'));
