const crypto = require('crypto');
const mongoose = require('mongoose');
const { Booking, Payment, SeatInventory } = require('../models');
const ApiError = require('../utils/ApiError');
const realtime = require('../realtime');
const { closePendingBooking } = require('./bookingService');
const { notify } = require('./notificationService');

const describe = async (booking) => {
  await booking.populate({ path: 'show', select: 'startsAt screenName movie theater', populate: [{ path: 'movie', select: 'title' }, { path: 'theater', select: 'name' }] });
  const s = booking.show;
  return `${s.movie.title} at ${s.theater.name} (${s.screenName}), ${s.startsAt.toISOString()} · seats ${booking.seats.map((x) => x.label).join(', ')} · ₹${booking.totalAmount} · ref ${booking.reference}`;
};

/**
 * SIMULATED payment. No card data exists anywhere. SUCCESS confirms the booking and books the seats in ONE
 * transaction (guarded by status=PENDING and an unexpired hold, so a double/concurrent pay can succeed only once).
 * FAILURE marks the payment FAILED, the booking FAILED and releases the seats in one transaction.
 */
async function payBooking({ userId, bookingId, outcome }) {
  const booking = await Booking.findOne({ _id: bookingId, user: userId });
  if (!booking) throw new ApiError(404, 'Booking not found');
  if (booking.status === 'PENDING' && booking.expiresAt <= new Date()) {
    await closePendingBooking(booking._id, 'EXPIRED', { onlyIfExpired: true });
    throw new ApiError(409, 'This reservation has expired. Please select your seats again.');
  }
  if (booking.status !== 'PENDING') throw new ApiError(409, `This booking cannot be paid (status: ${booking.status})`);

  // the attempt is recorded first so it survives even if the transaction below fails
  const payment = await Payment.create({ booking: booking._id, user: userId, amount: booking.totalAmount, status: 'INITIATED' });
  const markFailed = (reason) => Payment.updateOne({ _id: payment._id, status: 'INITIATED' }, { status: 'FAILED', failureReason: reason });

  try {
    if (outcome === 'FAILURE') {
      const closed = await mongoose.connection.transaction(async (session) => {
        const b = await closePendingBooking(booking._id, 'FAILED', { session });
        if (!b) throw new ApiError(409, 'Booking is no longer pending');
        await Payment.updateOne({ _id: payment._id }, { status: 'FAILED', failureReason: 'Simulated payment was declined' }, { session });
        return b;
      });
      realtime.seatsChanged(closed.show);
      await notify({ userId, bookingId: closed._id, type: 'PAYMENT_FAILED', title: 'Payment failed', message: `Your simulated payment failed and the seats were released. ${await describe(closed)}` });
    } else {
      const done = await mongoose.connection.transaction(async (session) => {
        const b = await Booking.findOneAndUpdate(
          { _id: booking._id, status: 'PENDING', expiresAt: { $gt: new Date() } },
          { $set: { status: 'CONFIRMED', confirmedAt: new Date() }, $unset: { expiresAt: '' } },
          { returnDocument: 'after', session });
        if (!b) throw new ApiError(409, 'This reservation is no longer pending or has expired');
        const r = await SeatInventory.updateMany({ booking: b._id, status: 'HELD' },
          { $set: { status: 'BOOKED' }, $unset: { holdExpiresAt: '' } }, { session });
        if (r.modifiedCount !== b.seats.length) throw new ApiError(409, 'Seats are no longer held for this booking');
        await Payment.updateOne({ _id: payment._id }, { status: 'SUCCEEDED', transactionRef: `SIM-${crypto.randomBytes(8).toString('hex').toUpperCase()}` }, { session });
        return b;
      });
      realtime.seatsChanged(done.show);
      await notify({ userId, bookingId: done._id, type: 'BOOKING_CONFIRMED', title: 'Booking confirmed', message: `Your booking is confirmed. ${await describe(done)}` });
    }
  } catch (e) {
    await markFailed(e.message).catch(() => {});
    throw e;
  }
  return {
    booking: await Booking.findById(booking._id),
    payment: await Payment.findById(payment._id),
  };
}

module.exports = { payBooking, describe };
