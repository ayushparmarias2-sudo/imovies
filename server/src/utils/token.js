const jwt = require('jsonwebtoken');
const config = require('../config/env');

const COOKIE = 'token';
const cookieOptions = () => ({
  httpOnly: true,
  secure: config.cookie.secure,
  sameSite: config.cookie.sameSite,
  path: '/',
});

const signToken = (user) => jwt.sign({ sub: String(user._id) }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
const verifyToken = (t) => jwt.verify(t, config.jwtSecret);
const setAuthCookie = (res, user) =>
  res.cookie(COOKIE, signToken(user), { ...cookieOptions(), maxAge: config.cookie.maxAgeMs });
const clearAuthCookie = (res) => res.clearCookie(COOKIE, cookieOptions());

module.exports = { COOKIE, signToken, verifyToken, setAuthCookie, clearAuthCookie };
