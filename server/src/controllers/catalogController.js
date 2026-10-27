const { Movie, Theater, Show, SeatInventory, Booking } = require('../models');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const showService = require('../services/showService');
const { availableFilter } = require('../services/seatService');
const { localDayRange } = require('../utils/dates');

const ok = (res, data, status = 200, meta) => res.status(status).json({ success: true, data, ...(meta ? { meta } : {}) });
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isAdmin = (req) => req.user && req.user.role === 'ADMIN';

// ---------- Movies ----------
exports.listMovies = asyncHandler(async (req, res) => {
  const { search, genre, status, availability, includeInactive, page, limit } = req.valid.query;
  const now = new Date();
  const filter = {};
  if (!(includeInactive === 'true' && isAdmin(req))) filter.isActive = true;
  if (search) filter.title = { $regex: escapeRegex(search), $options: 'i' };
  if (genre) filter.genres = genre;
  if (status === 'nowShowing') filter.releaseDate = { $lte: now };
  if (status === 'upcoming') filter.releaseDate = { $gt: now };
  if (availability === 'withShows') {
    filter._id = { $in: await Show.distinct('movie', { status: 'SCHEDULED', startsAt: { $gt: now } }) };
  }
  const [items, total] = await Promise.all([
    Movie.find(filter).sort({ releaseDate: -1, title: 1 }).skip((page - 1) * limit).limit(limit),
    Movie.countDocuments(filter),
  ]);
  ok(res, items, 200, { page, limit, total, pages: Math.ceil(total / limit) });
});

exports.listGenres = (req, res) => ok(res, Movie.GENRES);

exports.getMovie = asyncHandler(async (req, res) => {
  const movie = await Movie.findById(req.valid.params.id);
  if (!movie || (!movie.isActive && !isAdmin(req))) throw new ApiError(404, 'Movie not found');
  ok(res, movie);
});

exports.createMovie = asyncHandler(async (req, res) => ok(res, await Movie.create(req.valid.body), 201));

exports.updateMovie = asyncHandler(async (req, res) => {
  const movie = await Movie.findByIdAndUpdate(req.valid.params.id, { $set: req.valid.body }, { returnDocument: 'after', runValidators: true });
  if (!movie) throw new ApiError(404, 'Movie not found');
  ok(res, movie);
});

exports.deleteMovie = asyncHandler(async (req, res) => {
  const { id } = req.valid.params;
  if (await Show.exists({ movie: id })) {
    throw new ApiError(409, 'This movie has shows and cannot be deleted. Set isActive=false instead.');
  }
  if (!(await Movie.findByIdAndDelete(id))) throw new ApiError(404, 'Movie not found');
  ok(res, { message: 'Movie deleted' });
});

// ---------- Theaters ----------
exports.listTheaters = asyncHandler(async (req, res) => ok(res, await Theater.find().sort({ city: 1, name: 1 })));

exports.getTheater = asyncHandler(async (req, res) => {
  const t = await Theater.findById(req.valid.params.id);
  if (!t) throw new ApiError(404, 'Theater not found');
  ok(res, t);
});

exports.createTheater = asyncHandler(async (req, res) => ok(res, await Theater.create(req.valid.body), 201));

exports.updateTheater = asyncHandler(async (req, res) => {
  const { id } = req.valid.params;
  const theater = await Theater.findById(id);
  if (!theater) throw new ApiError(404, 'Theater not found');
  if (req.valid.body.screens && (await Show.exists({ theater: id }))) {
    throw new ApiError(409, 'Screens cannot be changed while the theater has shows');
  }
  theater.set(req.valid.body);
  await theater.save();
  ok(res, theater);
});

exports.deleteTheater = asyncHandler(async (req, res) => {
  const { id } = req.valid.params;
  if (await Show.exists({ theater: id })) throw new ApiError(409, 'This theater has shows and cannot be deleted');
  if (!(await Theater.findByIdAndDelete(id))) throw new ApiError(404, 'Theater not found');
  ok(res, { message: 'Theater deleted' });
});

// ---------- Shows ----------
exports.listShows = asyncHandler(async (req, res) => {
  const { movie, theater, date, limit } = req.valid.query;
  const now = new Date();
  const filter = { status: 'SCHEDULED', startsAt: { $gt: now } };
  if (movie) filter.movie = movie;
  if (theater) filter.theater = theater;
  if (date) {
    const { start, end } = localDayRange(date);
    filter.startsAt = { $gt: start > now ? start : now, $lt: end };
  }
  const shows = await Show.find(filter).sort({ startsAt: 1 }).limit(limit)
    .populate('movie', 'title posterUrl durationMinutes certificate language').populate('theater', 'name city address');
  const counts = await SeatInventory.aggregate([
    { $match: { show: { $in: shows.map((s) => s._id) }, ...availableFilter(now) } },
    { $group: { _id: '$show', n: { $sum: 1 } } },
  ]);
  const byShow = new Map(counts.map((c) => [String(c._id), c.n]));
  ok(res, shows.map((s) => ({ ...s.toJSON(), availableSeats: byShow.get(String(s._id)) || 0 })));
});

exports.getShow = asyncHandler(async (req, res) => {
  const show = await Show.findById(req.valid.params.id)
    .populate('movie', 'title posterUrl durationMinutes certificate language').populate('theater', 'name city address');
  if (!show) throw new ApiError(404, 'Show not found');
  ok(res, show);
});

exports.getSeats = asyncHandler(async (req, res) => {
  const show = await Show.findById(req.valid.params.id);
  if (!show) throw new ApiError(404, 'Show not found');
  const now = new Date();
  const seats = await SeatInventory.find({ show: show._id }).sort({ row: 1, number: 1 });
  const mine = req.user
    ? new Set((await Booking.find({ user: req.user._id, show: show._id, status: 'PENDING', expiresAt: { $gt: now } }).select('_id')).map((b) => String(b._id)))
    : new Set();
  const view = seats.map((s) => {
    const expired = s.status === 'HELD' && s.holdExpiresAt <= now;
    return {
      label: s.label, row: s.row, number: s.number, category: s.category, price: s.price,
      status: expired ? 'AVAILABLE' : s.status,
      heldByYou: s.status === 'HELD' && !expired && s.booking ? mine.has(String(s.booking)) : false,
    };
  });
  const summary = view.reduce((a, s) => ({ ...a, [s.status]: (a[s.status] || 0) + 1 }), { AVAILABLE: 0, HELD: 0, BOOKED: 0 });
  ok(res, { showId: show._id, pricing: show.pricing, summary, seats: view });
});

exports.createShow = asyncHandler(async (req, res) => {
  const b = req.valid.body;
  ok(res, await showService.createShow({ movieId: b.movie, theaterId: b.theater, screenName: b.screenName, startsAt: b.startsAt, pricing: b.pricing }), 201);
});

exports.deleteShow = asyncHandler(async (req, res) => {
  const { id } = req.valid.params;
  if (await Booking.exists({ show: id })) throw new ApiError(409, 'This show has bookings and cannot be deleted');
  const mongoose = require('mongoose');
  const deleted = await mongoose.connection.transaction(async (session) => {
    const show = await Show.findByIdAndDelete(id, { session });
    if (show) await SeatInventory.deleteMany({ show: id }, { session });
    return show;
  });
  if (!deleted) throw new ApiError(404, 'Show not found');
  ok(res, { message: 'Show deleted' });
});
