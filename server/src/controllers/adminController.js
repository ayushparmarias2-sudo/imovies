const { Movie, Theater, Show, Booking, User } = require('../models');
const asyncHandler = require('../utils/asyncHandler');
const { cancelBooking } = require('../services/cancellationService');
const { expireStaleReservations } = require('../services/bookingService');

const ok = (res, data, meta) => res.json({ success: true, data, ...(meta ? { meta } : {}) });

exports.stats = asyncHandler(async (req, res) => {
  const now = new Date();
  const [movies, theaters, upcomingShows, customers, byStatus, revenue] = await Promise.all([
    Movie.countDocuments({ isActive: true }), Theater.countDocuments(),
    Show.countDocuments({ status: 'SCHEDULED', startsAt: { $gt: now } }), User.countDocuments({ role: 'CUSTOMER' }),
    Booking.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
    Booking.aggregate([{ $match: { status: 'CONFIRMED' } }, { $group: { _id: null, total: { $sum: '$totalAmount' } } }]),
  ]);
  ok(res, { movies, theaters, upcomingShows, customers, bookingsByStatus: Object.fromEntries(byStatus.map((b) => [b._id, b.n])), confirmedRevenue: revenue[0]?.total || 0 });
});

exports.listBookings = asyncHandler(async (req, res) => {
  await expireStaleReservations();
  const { status, show, page, limit } = req.valid.query;
  const filter = {};
  if (status) filter.status = status;
  if (show) filter.show = show;
  const [items, total] = await Promise.all([
    Booking.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit)
      .populate('user', 'name email')
      .populate({ path: 'show', select: 'startsAt screenName movie theater', populate: [{ path: 'movie', select: 'title' }, { path: 'theater', select: 'name' }] }),
    Booking.countDocuments(filter),
  ]);
  ok(res, items, { page, limit, total, pages: Math.ceil(total / limit) });
});

/** Admin override: may cancel a CONFIRMED booking even inside the customer cancellation window. */
exports.cancelBooking = asyncHandler(async (req, res) => {
  ok(res, await cancelBooking({ bookingId: req.valid.params.id, actor: req.user, adminOverride: true }));
});
