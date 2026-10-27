const crypto = require('crypto');
const mongoose = require('mongoose');
const { Show, SeatInventory, Booking } = require('../models');
const ApiError = require('../utils/ApiError');
const config = require('../config/env');
const { availableFilter } = require('./seatService');
const realtime = require('../realtime');

const REF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newReference() {
  const bytes = crypto.randomBytes(10);
  return 'IM-' + Array.from(bytes, (b) => REF_ALPHABET[b % REF_ALPHABET.length]).join('');
}

/**
 * Concurrency-safe multi-seat reservation.
 *
 * Everything runs in ONE MongoDB transaction (requires a replica set):
 *  1. validate show + seats, 2. create PENDING booking, 3. flip ALL requested seats to HELD with a single
 *  guarded updateMany (only AVAILABLE or expired-HELD seats match). If fewer seats matched than requested,
 *  the transaction aborts => no partial holds. Concurrent transactions touching the same seat hit a
 *  write conflict; the driver retries the loser, which then sees the seat as HELD and fails with 409.
 */
async function reserveSeatsTxn({ userId, showId, seatLabels }) {
  const labels = [...new Set(seatLabels)];
  if (labels.length !== seatLabels.length) throw new ApiError(400, 'Duplicate seats in request');
  if (labels.length > config.booking.maxSeats) {
    throw new ApiError(400, `You can book at most ${config.booking.maxSeats} seats at a time`);
  }

  return mongoose.connection.transaction(async (session) => {
    const now = new Date();
    const show = await Show.findById(showId).session(session);
    if (!show) throw new ApiError(404, 'Show not found');
    if (show.status !== 'SCHEDULED') throw new ApiError(409, 'This show is not open for booking');
    if (show.startsAt <= now) throw new ApiError(409, 'This show has already started');

    const existing = await Booking.findOne({
      user: userId, show: show._id, status: 'PENDING', expiresAt: { $gt: now },
    }).session(session);
    if (existing) {
      throw new ApiError(409, 'You already have a pending reservation for this show. Complete or release it first.', {
        bookingId: existing._id,
      });
    }

    const seats = await SeatInventory.find({ show: show._id, label: { $in: labels } }).session(session);
    if (seats.length !== labels.length) {
      const found = new Set(seats.map((s) => s.label));
      throw new ApiError(400, 'Some seats do not exist for this show', { invalidSeats: labels.filter((l) => !found.has(l)) });
    }

    const expiresAt = new Date(now.getTime() + config.booking.holdMinutes * 60000);
    const bookedSeats = labels.map((l) => {
      const s = seats.find((x) => x.label === l);
      return { label: s.label, category: s.category, price: s.price }; // prices come from the DB only
    });
    const totalAmount = bookedSeats.reduce((sum, s) => sum + s.price, 0);

    const [booking] = await Booking.create(
      [{ reference: newReference(), user: userId, show: show._id, seats: bookedSeats, totalAmount, status: 'PENDING', expiresAt }],
      { session }
    );

    const result = await SeatInventory.updateMany(
      { show: show._id, label: { $in: labels }, ...availableFilter(now) },
      { $set: { status: 'HELD', booking: booking._id, holdExpiresAt: expiresAt } },
      { session }
    );
    if (result.modifiedCount !== labels.length) {
      const taken = await SeatInventory.find({
        show: show._id, label: { $in: labels }, booking: { $ne: booking._id },
      }).session(session);
      throw new ApiError(409, 'Some of the selected seats are no longer available', {
        unavailableSeats: taken.map((s) => s.label),
      });
    }
    return booking;
  });
}

async function reserveSeats(args) {
  const booking = await reserveSeatsTxn(args);
  realtime.seatsChanged(booking.show);
  return booking;
}

/** Runs fn inside the caller's session, or opens a new transaction when none is given. */
const inTxn = (session, fn) => (session ? fn(session) : mongoose.connection.transaction(fn));

/**
 * Moves a PENDING booking to a terminal status (CANCELLED / EXPIRED / FAILED) and frees its HELD seats,
 * atomically. Returns null if the booking was not PENDING (or not yet expired when onlyIfExpired is set).
 * Seats are matched by booking id, so a seat already re-held by someone else is never touched.
 */
async function closePendingBooking(bookingId, toStatus, { onlyIfExpired = false, session: outer } = {}) {
  const booking = await inTxn(outer, async (session) => {
    const filter = { _id: bookingId, status: 'PENDING' };
    if (onlyIfExpired) filter.expiresAt = { $lte: new Date() };
    const update = { status: toStatus };
    if (toStatus === 'CANCELLED') update.cancelledAt = new Date();
    const b = await Booking.findOneAndUpdate(filter, { $set: update }, { returnDocument: 'after', session });
    if (!b) return null;
    await SeatInventory.updateMany(
      { booking: b._id, status: 'HELD' },
      { $set: { status: 'AVAILABLE' }, $unset: { booking: '', holdExpiresAt: '' } },
      { session }
    );
    return b;
  });
  if (booking && !outer) realtime.seatsChanged(booking.show);
  return booking;
}

/** Expires every lapsed PENDING reservation (optionally for one user). Returns how many were expired. */
async function expireStaleReservations({ userId } = {}) {
  const filter = { status: 'PENDING', expiresAt: { $lte: new Date() } };
  if (userId) filter.user = userId;
  const stale = await Booking.find(filter).select('_id').limit(500).lean();
  let count = 0;
  for (const { _id } of stale) {
    if (await closePendingBooking(_id, 'EXPIRED', { onlyIfExpired: true })) count++;
  }
  return count;
}

module.exports = { reserveSeats, closePendingBooking, expireStaleReservations, newReference };
