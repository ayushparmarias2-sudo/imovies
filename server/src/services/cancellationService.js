const mongoose = require('mongoose');
const { Booking, Payment, SeatInventory } = require('../models');
const ApiError = require('../utils/ApiError');
const config = require('../config/env');
const realtime = require('../realtime');
const { notify } = require('./notificationService');
const { describe } = require('./paymentService');

/** Explicit rules: only CONFIRMED bookings; customers must cancel at least CANCEL_CUTOFF_HOURS before the show. */
function cancellationInfo(booking, show) {
  if (booking.status !== 'CONFIRMED') return { allowed: false, reason: `Only confirmed bookings can be cancelled (this one is ${booking.status.toLowerCase()})` };
  const deadline = new Date(show.startsAt.getTime() - config.cancelCutoffHours * 3600000);
  if (new Date() > deadline) return { allowed: false, deadline, reason: `Cancellation closes ${config.cancelCutoffHours} hours before the show` };
  return { allowed: true, deadline };
}

async function cancelBooking({ bookingId, actor, adminOverride = false }) {
  const booking = await Booking.findById(bookingId).populate('show', 'startsAt');
  const isOwner = booking && String(booking.user) === String(actor._id);
  if (!booking || (!isOwner && !(adminOverride && actor.role === 'ADMIN'))) throw new ApiError(404, 'Booking not found');

  const info = cancellationInfo(booking, booking.show);
  if (!info.allowed && !(adminOverride && booking.status === 'CONFIRMED')) throw new ApiError(409, info.reason);

  const cancelled = await mongoose.connection.transaction(async (session) => {
    const b = await Booking.findOneAndUpdate({ _id: booking._id, status: 'CONFIRMED' },
      { $set: { status: 'CANCELLED', cancelledAt: new Date() } }, { returnDocument: 'after', session });
    if (!b) throw new ApiError(409, 'This booking is no longer confirmed');
    const r = await SeatInventory.updateMany({ booking: b._id, status: 'BOOKED' },
      { $set: { status: 'AVAILABLE' }, $unset: { booking: '', holdExpiresAt: '' } }, { session });
    if (r.modifiedCount !== b.seats.length) throw new ApiError(500, 'Seat inventory is inconsistent for this booking');
    await Payment.updateMany({ booking: b._id, status: 'SUCCEEDED' }, { status: 'REFUNDED', refundedAt: new Date() }, { session }); // simulated refund
    return b;
  });
  realtime.seatsChanged(cancelled.show);
  await notify({ userId: cancelled.user, bookingId: cancelled._id, type: 'BOOKING_CANCELLED', title: 'Booking cancelled',
    message: `Your booking was cancelled and the (simulated) payment refunded. ${await describe(cancelled)}` });
  return cancelled;
}

module.exports = { cancelBooking, cancellationInfo };
