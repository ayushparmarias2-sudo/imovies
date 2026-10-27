const mongoose = require('mongoose');
const app = require('../src/app');
const h = require('./helpers');
const ApiError = require('../src/utils/ApiError');
const { createShow } = require('../src/services/showService');

const request = h.request;
const { Movie, Theater, Show, ScreenSchedule, SeatInventory } = h.models;
const MIN = 60000;
const SLOT = (120 + 15) * MIN; // movie duration + cleaning buffer used by the service

let movie; let admin; let n = 0;
const base = () => Date.now() + 72 * 3600000;

beforeAll(async () => {
  await h.connectDb('schedule');
  movie = await Movie.create({ title: 'Sched Movie', description: 'A movie for scheduling tests.', genres: ['Action'], durationMinutes: 120, language: 'English', releaseDate: new Date(Date.now() - 86400000) });
  admin = await h.createUser('ADMIN');
});
afterAll(() => h.disconnectDb());
afterEach(() => jest.restoreAllMocks());

const newTheater = (screenNames = ['Screen 1']) => Theater.create({
  name: `Sched Hall ${++n}`, city: 'Indore', address: '1 Test Road',
  screens: screenNames.map((name) => ({ name, rows: 3, seatsPerRow: 4, premiumRows: 1 })),
});
const make = (theater, startsAt, screenName = 'Screen 1') => createShow({
  movieId: movie._id, theaterId: theater._id, screenName, startsAt: new Date(startsAt), pricing: { standard: 100, premium: 200 },
});
const status = (r) => (r.status === 'fulfilled' ? 201 : r.reason.status);

describe('schedule validation (sequential)', () => {
  test('overlapping shows on one screen are rejected, adjacent ones are allowed', async () => {
    const t = await newTheater();
    const t0 = base();
    await make(t, t0);
    for (const off of [0, 1 * MIN, 60 * MIN, SLOT - MIN, -(SLOT - MIN)]) {
      await expect(make(t, t0 + off)).rejects.toMatchObject({ status: 409 });
    }
    await expect(make(t, t0 + SLOT)).resolves.toBeDefined(); // starts exactly when the buffer ends
    await expect(make(t, t0 - SLOT)).resolves.toBeDefined(); // ends exactly when the first starts
    expect(await Show.countDocuments({ theater: t._id })).toBe(3);
  });

  test('overlapping times on different screens or different theaters stay allowed', async () => {
    const t = await newTheater(['Screen 1', 'Screen 2']);
    const other = await newTheater();
    const t0 = base();
    await make(t, t0, 'Screen 1');
    await expect(make(t, t0, 'Screen 2')).resolves.toBeDefined();
    await expect(make(other, t0)).resolves.toBeDefined();
  });

  test('deleting a show frees its slot (deletion rules unchanged)', async () => {
    const t = await newTheater();
    const t0 = base();
    const s = await make(t, t0);
    expect((await request(app).delete(`/api/shows/${s.id}`).set('Cookie', admin.cookie)).status).toBe(200);
    await expect(make(t, t0 + 30 * MIN)).resolves.toBeDefined();
  });
});

describe('concurrent creation', () => {
  test('two transactions writing the same screen lock cannot both proceed (WriteConflict = the serialisation point)', async () => {
    const t = await newTheater();
    await ScreenSchedule.updateOne({ theater: t._id, screenName: 'Screen 1' }, { $setOnInsert: { version: 0 } }, { upsert: true });
    const s1 = await mongoose.connection.startSession();
    const s2 = await mongoose.connection.startSession();
    try {
      s1.startTransaction(); s2.startTransaction();
      const key = { theater: t._id, screenName: 'Screen 1' };
      await ScreenSchedule.updateOne(key, { $inc: { version: 1 } }, { session: s1 });
      const err = await ScreenSchedule.updateOne(key, { $inc: { version: 1 } }, { session: s2 }).catch((e) => e);
      expect(err.hasErrorLabel('TransientTransactionError')).toBe(true); // => runTransaction aborts and retries
      await s1.commitTransaction();
      await s2.abortTransaction();
    } finally { await s1.endSession(); await s2.endSession(); }
    expect((await ScreenSchedule.findOne({ theater: t._id })).version).toBe(1);
  });

  test('N simultaneous overlapping requests on one screen: exactly one commits (20 rounds, no sleeps)', async () => {
    for (let round = 0; round < 20; round++) {
      const t = await newTheater();
      const t0 = base();
      const results = await Promise.allSettled([0, 10, 20, 30, 45, 60].map((m) => make(t, t0 + m * MIN)));
      const codes = results.map(status);
      expect(codes.filter((c) => c === 201)).toHaveLength(1);
      expect(codes.filter((c) => c === 409)).toHaveLength(5); // every loser is a clean 409, never a 500
      const shows = await Show.find({ theater: t._id });
      expect(shows).toHaveLength(1);
      expect(await SeatInventory.countDocuments({ show: shows[0]._id })).toBe(12);
    }
  });

  test('same race through the HTTP API: one 201, the rest 409', async () => {
    for (let round = 0; round < 6; round++) {
      const t = await newTheater();
      const t0 = base();
      const res = await Promise.all([0, 15, 30, 50].map((m) => request(app).post('/api/shows').set('Cookie', admin.cookie)
        .send({ movie: movie.id, theater: t.id, screenName: 'Screen 1', startsAt: new Date(t0 + m * MIN).toISOString(), pricing: { standard: 100, premium: 200 } })));
      expect(res.map((r) => r.status).sort()).toEqual([201, 409, 409, 409]);
      expect(await Show.countDocuments({ theater: t._id })).toBe(1);
    }
  });

  test('simultaneous NON-overlapping requests on one screen all succeed (conflicts are retried, not failed)', async () => {
    for (let round = 0; round < 8; round++) {
      const t = await newTheater();
      const t0 = base();
      const results = await Promise.allSettled([0, 1, 2].map((i) => make(t, t0 + i * SLOT)));
      expect(results.map(status)).toEqual([201, 201, 201]);
      expect(await Show.countDocuments({ theater: t._id })).toBe(3);
    }
  });

  test('different screens do not block each other and both commit', async () => {
    const t = await newTheater(['Screen 1', 'Screen 2']);
    const t0 = base();
    const results = await Promise.allSettled([make(t, t0, 'Screen 1'), make(t, t0, 'Screen 2')]);
    expect(results.map(status)).toEqual([201, 201]);
    const locks = await ScreenSchedule.find({ theater: t._id });
    expect(locks).toHaveLength(2); // one independent lock per screen
  });
});

describe('transaction failure and retry policy', () => {
  const transient = () => {
    const e = new mongoose.mongo.MongoServerError({ message: 'simulated write conflict', code: 112 });
    e.addErrorLabel('TransientTransactionError');
    return e;
  };

  test('a failure mid-transaction leaves no show, no seats and does not bump the lock', async () => {
    const t = await newTheater();
    const seatsBefore = await SeatInventory.countDocuments({});
    jest.spyOn(SeatInventory, 'insertMany').mockRejectedValue(new Error('simulated disk failure'));
    await expect(make(t, base())).rejects.toThrow('simulated disk failure');
    expect(await Show.countDocuments({ theater: t._id })).toBe(0);
    expect(await SeatInventory.countDocuments({})).toBe(seatsBefore);
    expect((await ScreenSchedule.findOne({ theater: t._id })).version).toBe(0); // the $inc was rolled back too
  });

  test('a transient error is retried once and results in exactly one show', async () => {
    const t = await newTheater();
    const real = SeatInventory.insertMany.bind(SeatInventory);
    const spy = jest.spyOn(SeatInventory, 'insertMany').mockRejectedValueOnce(transient()).mockImplementation(real);
    const show = await make(t, base());
    expect(show).toBeDefined();
    expect(spy).toHaveBeenCalledTimes(2);
    expect(await Show.countDocuments({ theater: t._id })).toBe(1);
    expect(await SeatInventory.countDocuments({ show: show._id })).toBe(12);
    expect((await ScreenSchedule.findOne({ theater: t._id })).version).toBe(1); // only the committed attempt counts
  });

  test('retries are bounded: persistent conflicts end in a 409, never a silent success or a hang', async () => {
    const t = await newTheater();
    const spy = jest.spyOn(SeatInventory, 'insertMany').mockRejectedValue(transient());
    const err = await make(t, base()).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(409);
    expect(spy).toHaveBeenCalledTimes(5);
    expect(await Show.countDocuments({ theater: t._id })).toBe(0);
  });

  test('bogus theater/screen input creates no lock document', async () => {
    const before = await ScreenSchedule.countDocuments({});
    const t = await newTheater();
    await expect(make(t, base(), 'No Such Screen')).rejects.toMatchObject({ status: 400 });
    await expect(make({ _id: new mongoose.Types.ObjectId() }, base())).rejects.toMatchObject({ status: 404 });
    expect(await ScreenSchedule.countDocuments({})).toBe(before);
  });
});
