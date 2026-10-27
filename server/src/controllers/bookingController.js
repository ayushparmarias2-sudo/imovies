const { Booking, Payment } = require('../models');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const svc = require('../services/bookingService');
const { payBooking } = require('../services/paymentService');
const { cancelBooking, cancellationInfo } = require('../services/cancellationService');

const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });
const populate = {
  path: 'show', select: 'startsAt endsAt screenName movie theater',
  populate: [{ path: 'movie', select: 'title posterUrl durationMinutes' }, { path: 'theater', select: 'name city address' }],
};

exports.reserve = asyncHandler(async (req, res) => {
  const { showId, seats } = req.valid.body;
  const booking = await svc.reserveSeats({ userId: req.user._id, showId, seatLabels: seats });
  ok(res, booking, 201);
});

exports.mine = asyncHandler(async (req, res) => {
  await svc.expireStaleReservations({ userId: req.user._id });
  ok(res, await Booking.find({ user: req.user._id }).sort({ createdAt: -1 }).populate(populate));
});

/** Owner or admin only; other users get 404 so booking ids are not discoverable. */
async function loadAccessible(req) {
  let booking = await Booking.findById(req.valid.params.id);
  const allowed = booking && (String(booking.user) === String(req.user._id) || req.user.role === 'ADMIN');
  if (!allowed) throw new ApiError(404, 'Booking not found');
  if (booking.status === 'PENDING' && booking.expiresAt <= new Date()) {
    await svc.closePendingBooking(booking._id, 'EXPIRED', { onlyIfExpired: true });
    booking = await Booking.findById(booking._id);
  }
  return booking;
}

exports.get = asyncHandler(async (req, res) => {
  const booking = await loadAccessible(req);
  await booking.populate(populate);
  const payments = await Payment.find({ booking: booking._id }).sort({ createdAt: 1 });
  ok(res, { ...booking.toJSON(), payments, cancellation: cancellationInfo(booking, booking.show) });
});

exports.pay = asyncHandler(async (req, res) => {
  const { booking, payment } = await payBooking({ userId: req.user._id, bookingId: req.valid.params.id, outcome: req.valid.body.outcome });
  ok(res, { booking, payment }); // a declined simulated payment is a normal outcome: inspect payment.status
});

exports.cancel = asyncHandler(async (req, res) => {
  ok(res, await cancelBooking({ bookingId: req.valid.params.id, actor: req.user }));
});

exports.release = asyncHandler(async (req, res) => {
  const booking = await loadAccessible(req);
  if (String(booking.user) !== String(req.user._id)) throw new ApiError(403, 'Only the booking owner can release a reservation');
  const closed = await svc.closePendingBooking(booking._id, 'CANCELLED');
  if (!closed) throw new ApiError(409, `Only pending reservations can be released (current status: ${booking.status})`);
  ok(res, closed);
});
