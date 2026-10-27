const availableFilter = (now = new Date()) => ({
  $or: [{ status: 'AVAILABLE' }, { status: 'HELD', holdExpiresAt: { $lte: now } }],
});

module.exports = { availableFilter };
