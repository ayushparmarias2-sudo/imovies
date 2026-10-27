const mongoose = require('mongoose');
const supertest = require('supertest');
const models = require('../src/models');
const { signToken } = require('../src/utils/token');
const { createShow } = require('../src/services/showService');

exports.models = models;
let currentDb = null;
exports.dbName = () => currentDb;
exports.connectDb = async (label) => {
  currentDb = `imovies_test_${label}_${process.pid}`;
  // Jest's VM sandbox cannot dynamic-import('os') used by the driver's handshake; supply it explicitly.
  await mongoose.connect(process.env.TEST_MONGO_URI, {
    dbName: currentDb,
    runtimeAdapters: { os: require('os') },
  });
  await Promise.all(Object.values(models).map((m) => m.init())); // make sure unique indexes exist
};
exports.disconnectDb = async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); };
exports.resetDb = () => Promise.all(Object.values(models).map((m) => m.deleteMany({})));

let n = 0;
exports.createUser = async (role = 'CUSTOMER') => {
  n++;
  const user = await models.User.create({ name: `User ${n}`, email: `user${n}-${Date.now()}@test.dev`, passwordHash: 'x', role });
  return { user, cookie: `token=${signToken(user)}` };
};

let catalogN = 0;
exports.createCatalog = async ({ rows = 5, seatsPerRow = 6, premiumRows = 1, hoursAhead = 48 } = {}) => {
  const movie = await models.Movie.create({
    title: 'Test Movie', description: 'A movie used for automated tests.', genres: ['Action'],
    durationMinutes: 120, language: 'English', releaseDate: new Date(Date.now() - 86400000),
  });
  const theater = await models.Theater.create({
    name: `Test Theater ${++catalogN}`, city: 'Indore', address: '1 Test Road, Indore',
    screens: [{ name: 'Screen 1', rows, seatsPerRow, premiumRows }],
  });
  const show = await createShow({
    movieId: movie._id, theaterId: theater._id, screenName: 'Screen 1',
    startsAt: new Date(Date.now() + hoursAhead * 3600000), pricing: { standard: 200, premium: 350 },
  });
  return { movie, theater, show };
};

/** Every HELD seat must belong to a live PENDING booking that lists it, and vice-versa. */
exports.assertConsistent = async (showId) => {
  const { SeatInventory, Booking } = models;
  const held = await SeatInventory.find({ show: showId, status: 'HELD' });
  const pending = await Booking.find({ show: showId, status: 'PENDING' });
  const expected = pending.flatMap((b) => b.seats.map((s) => `${b._id}:${s.label}`)).sort();
  const actual = held.map((s) => `${s.booking}:${s.label}`).sort();
  expect(actual).toEqual(expected);
  const orphan = await SeatInventory.countDocuments({ show: showId, status: 'AVAILABLE', booking: { $exists: true } });
  expect(orphan).toBe(0);
};

/**
 * supertest wrapper that behaves like our frontend in a browser: every unsafe request carries the allowed Origin
 * header (browsers always send it). Security tests that need a missing/foreign Origin use raw `supertest` instead.
 */
exports.ORIGIN = 'http://localhost:5173';
exports.request = (app) => {
  const base = supertest(app);
  const withOrigin = (m) => (...a) => base[m](...a).set('Origin', exports.ORIGIN);
  return { get: base.get.bind(base), head: base.head.bind(base), options: base.options.bind(base),
    post: withOrigin('post'), put: withOrigin('put'), patch: withOrigin('patch'), delete: withOrigin('delete') };
};
