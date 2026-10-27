const { User } = require('../models');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { setAuthCookie, clearAuthCookie } = require('../utils/token');
const { hashPassword, verifyPassword } = require('../utils/password');

exports.register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.valid.body;
  if (await User.exists({ email })) throw new ApiError(409, 'An account with this email already exists');
  // role is never read from the request: new accounts are always CUSTOMER
  const user = await User.create({ name, email, passwordHash: await hashPassword(password) });
  setAuthCookie(res, user);
  res.status(201).json({ success: true, data: { user } });
});

exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.valid.body;
  const user = await User.findOne({ email }).select('+passwordHash');
  // Unknown emails are verified against a dummy hash of the same cost, so both failures look and cost the same.
  const ok = await verifyPassword(password, user && user.passwordHash);
  if (!user || !ok || !user.isActive) throw new ApiError(401, 'Invalid email or password');
  setAuthCookie(res, user);
  res.json({ success: true, data: { user } });
});

exports.logout = (req, res) => {
  clearAuthCookie(res);
  res.json({ success: true, data: { message: 'Logged out' } });
};

exports.me = (req, res) => res.json({ success: true, data: { user: req.user } });
