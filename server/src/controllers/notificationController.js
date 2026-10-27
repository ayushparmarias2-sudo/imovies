const { Notification } = require('../models');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

const ok = (res, data, meta) => res.json({ success: true, data, ...(meta ? { meta } : {}) });

exports.list = asyncHandler(async (req, res) => {
  const [items, unread] = await Promise.all([
    Notification.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(req.valid.query.limit),
    Notification.countDocuments({ user: req.user._id, readAt: { $exists: false } }),
  ]);
  ok(res, items, { unread });
});
exports.markRead = asyncHandler(async (req, res) => {
  const n = await Notification.findOneAndUpdate({ _id: req.valid.params.id, user: req.user._id }, { $set: { readAt: new Date() } }, { returnDocument: 'after' });
  if (!n) throw new ApiError(404, 'Notification not found');
  ok(res, n);
});
exports.markAllRead = asyncHandler(async (req, res) => {
  const r = await Notification.updateMany({ user: req.user._id, readAt: { $exists: false } }, { $set: { readAt: new Date() } });
  ok(res, { updated: r.modifiedCount });
});
