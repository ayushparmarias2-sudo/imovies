const { Movie, Theater, Show, ScreenSchedule, SeatInventory } = require('../models');
const ApiError = require('../utils/ApiError');
const { runTransaction } = require('../utils/transaction');

const CLEANING_BUFFER_MIN = 15;

function buildSeats(show, screen) {
  const seats = [];
  for (let r = 0; r < screen.rows; r++) {
    const row = String.fromCharCode(65 + r);
    const premium = r >= screen.rows - screen.premiumRows;
    for (let n = 1; n <= screen.seatsPerRow; n++) {
      seats.push({
        show: show._id,
        label: `${row}${n}`,
        row,
        number: n,
        category: premium ? 'PREMIUM' : 'STANDARD',
        price: premium ? show.pricing.premium : show.pricing.standard,
        status: 'AVAILABLE',
      });
    }
  }
  return seats;
}

/** Loads and validates everything a new show depends on. Pass `session` to read inside a transaction. */
async function loadAndValidate({ movieId, theaterId, screenName, startsAt }, session) {
  const opts = session ? { session } : {};
  // Sequential on purpose: operations of one transaction/session must not run in parallel.
  const movie = await Movie.findById(movieId, null, opts);
  const theater = await Theater.findById(theaterId, null, opts);
  if (!movie || !movie.isActive) throw new ApiError(404, 'Movie not found or inactive');
  if (!theater) throw new ApiError(404, 'Theater not found');
  const screen = theater.screens.find((s) => s.name === screenName);
  if (!screen) throw new ApiError(400, `Screen "${screenName}" does not exist in ${theater.name}`);

  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime())) throw new ApiError(400, 'Invalid show start time');
  if (start <= new Date()) throw new ApiError(400, 'Show start time must be in the future');
  if (start < movie.releaseDate) throw new ApiError(400, 'A show cannot start before the movie release date');

  const endsAt = new Date(start.getTime() + (movie.durationMinutes + CLEANING_BUFFER_MIN) * 60000);
  return { movie, theater, screen, start, endsAt };
}

/** Creates the per-screen lock document if missing. Idempotent and safe under races (duplicate key = already there). */
async function ensureScreenLock(theaterId, screenName) {
  try {
    await ScreenSchedule.updateOne({ theater: theaterId, screenName }, { $setOnInsert: { version: 0 } }, { upsert: true });
  } catch (e) {
    if (e.code !== 11000) throw e; // a concurrent request created it first: exactly what we wanted
  }
}

/**
 * Validates and creates a show plus its full seat inventory atomically, without ever double-booking a screen.
 *
 * Overlap safety (MongoDB has no unique constraint over arbitrary time ranges, so we serialise per screen):
 *  1. Inside the transaction we first write the screen's lock document ($inc version). Snapshot isolation gives
 *     first-committer-wins on that document: a concurrent transaction that touched it either committed before our
 *     snapshot (then its show is visible to our overlap query) or after/in flight (then our write fails with a
 *     WriteConflict and the transaction is retried in a fresh snapshot that sees its show).
 *  2. Only then do we run the overlap query, with the same session, so it reads that same snapshot.
 *  3. The show and its seats are inserted in the same transaction; nothing is visible unless all of it commits.
 * Transient conflicts are retried up to a fixed bound (utils/transaction). If contention persists we answer 409 rather
 * than ever committing without the check. Different screens use different lock documents and never contend.
 */
async function createShow({ movieId, theaterId, screenName, startsAt, pricing }) {
  // Cheap early validation (clear 4xx errors, and no lock document is created for bogus theater/screen input).
  await loadAndValidate({ movieId, theaterId, screenName, startsAt });
  await ensureScreenLock(theaterId, screenName);

  try {
    return await runTransaction(async (session) => {
      const lock = await ScreenSchedule.updateOne({ theater: theaterId, screenName }, { $inc: { version: 1 } }, { session });
      if (lock.matchedCount !== 1) throw new ApiError(409, 'Screen schedule lock is missing; please retry');

      // Authoritative re-read inside the transaction's snapshot (movie duration, screen layout, etc.).
      const { movie, theater, screen, start, endsAt } = await loadAndValidate({ movieId, theaterId, screenName, startsAt }, session);
      const clash = await Show.exists({
        theater: theater._id, screenName, status: 'SCHEDULED', startsAt: { $lt: endsAt }, endsAt: { $gt: start },
      }).session(session);
      if (clash) throw new ApiError(409, 'This screen already has an overlapping show');

      const [show] = await Show.create(
        [{ movie: movie._id, theater: theater._id, screenName, startsAt: start, endsAt, pricing }],
        { session }
      );
      await SeatInventory.insertMany(buildSeats(show, screen), { session });
      return show;
    });
  } catch (e) {
    if (e && typeof e.hasErrorLabel === 'function' && e.hasErrorLabel('TransientTransactionError')) {
      throw new ApiError(409, 'This screen\'s schedule is being changed by another request. Please retry.');
    }
    throw e;
  }
}

module.exports = { createShow, buildSeats };
