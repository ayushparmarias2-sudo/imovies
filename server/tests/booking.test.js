const app = require('../src/app');
const h = require('./helpers');
const request = h.request;
const { closePendingBooking, expireStaleReservations } = require('../src/services/bookingService');

const { SeatInventory, Booking } = h.models;
let cat, alice, bob;
beforeAll(() => h.connectDb('booking'));
afterAll(() => h.disconnectDb());
beforeEach(async () => {
  await h.resetDb();
  cat = await h.createCatalog({ rows: 5, seatsPerRow: 6, premiumRows: 1 }); // A1..E6, row E premium
  alice = await h.createUser();
  bob = await h.createUser();
});

const reserve = (user, seats, extra = {}) =>
  request(app).post('/api/bookings/reserve').set('Cookie', user.cookie).send({ showId: cat.show.id, seats, ...extra });
const seatMap = async () => (await request(app).get(`/api/shows/${cat.show.id}/seats`).set('Cookie', alice.cookie)).body.data;

describe('reservation basics', () => {
  test('requires authentication', async () => {
    const res = await request(app).post('/api/bookings/reserve').send({ showId: cat.show.id, seats: ['A1'] });
    expect(res.status).toBe(401);
  });
  test('reserves seats, derives the total on the server and ignores client prices', async () => {
    const res = await reserve(alice, ['A1', 'e2'], { totalAmount: 1, price: 1, seats_price: 1 });
    expect(res.status).toBe(201);
    const b = res.body.data;
    expect(b.status).toBe('PENDING');
    expect(b.reference).toMatch(/^IM-[A-Z2-9]{10}$/);
    expect(b.totalAmount).toBe(200 + 350);
    expect(b.seats.map((s) => s.label).sort()).toEqual(['A1', 'E2']);
    expect(new Date(b.expiresAt) > new Date()).toBe(true);
    const map = await seatMap();
    expect(map.summary).toMatchObject({ AVAILABLE: 28, HELD: 2, BOOKED: 0 });
    expect(map.seats.find((s) => s.label === 'A1')).toMatchObject({ status: 'HELD', heldByYou: true });
    const bobView = (await request(app).get(`/api/shows/${cat.show.id}/seats`).set('Cookie', bob.cookie)).body.data;
    expect(bobView.seats.find((s) => s.label === 'A1')).toMatchObject({ status: 'HELD', heldByYou: false });
    await h.assertConsistent(cat.show._id);
  });
  test('rejects invalid input: empty, malformed, duplicate, nonexistent seats, too many, bad show', async () => {
    expect((await reserve(alice, [])).status).toBe(400);
    expect((await reserve(alice, ['1A'])).status).toBe(400);
    expect((await reserve(alice, ['A1', 'A1'])).status).toBe(400);
    const missing = await reserve(alice, ['A1', 'Z9']);
    expect(missing.status).toBe(400);
    expect(missing.body.errors.invalidSeats).toEqual(['Z9']);
    expect((await reserve(alice, ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'B1', 'B2', 'B3'])).status).toBe(400);
    const badShow = await request(app).post('/api/bookings/reserve').set('Cookie', alice.cookie).send({ showId: 'nope', seats: ['A1'] });
    expect(badShow.status).toBe(400);
    const ghost = await request(app).post('/api/bookings/reserve').set('Cookie', alice.cookie).send({ showId: 'a'.repeat(24), seats: ['A1'] });
    expect(ghost.status).toBe(404);
    expect(await SeatInventory.countDocuments({ status: 'HELD' })).toBe(0); // nothing leaked
  });
  test('seats held by someone else -> 409 with the conflicting seats, and NO partial hold', async () => {
    await reserve(alice, ['B2']);
    const res = await reserve(bob, ['B1', 'B2', 'B3']);
    expect(res.status).toBe(409);
    expect(res.body.errors.unavailableSeats).toEqual(['B2']);
    const map = await seatMap();
    expect(map.seats.filter((s) => ['B1', 'B3'].includes(s.label)).every((s) => s.status === 'AVAILABLE')).toBe(true);
    expect(await Booking.countDocuments({ user: bob.user._id })).toBe(0);
    await h.assertConsistent(cat.show._id);
  });
  test('one active pending reservation per user per show', async () => {
    expect((await reserve(alice, ['A1'])).status).toBe(201);
    const again = await reserve(alice, ['A2']);
    expect(again.status).toBe(409);
    expect(again.body.errors.bookingId).toBeDefined();
  });
  test('cannot book a show that already started or is cancelled', async () => {
    await h.models.Show.updateOne({ _id: cat.show._id }, { startsAt: new Date(Date.now() - 60000) });
    expect((await reserve(alice, ['A1'])).status).toBe(409);
    await h.models.Show.updateOne({ _id: cat.show._id }, { startsAt: new Date(Date.now() + 3600000), status: 'CANCELLED' });
    expect((await reserve(alice, ['A1'])).status).toBe(409);
  });
});

describe('release, expiry and ownership', () => {
  test('owner can release a reservation: seats become available, booking CANCELLED', async () => {
    const id = (await reserve(alice, ['A1', 'A2'])).body.data.id;
    const rel = await request(app).post(`/api/bookings/${id}/release`).set('Cookie', alice.cookie);
    expect(rel.status).toBe(200);
    expect(rel.body.data.status).toBe('CANCELLED');
    expect((await seatMap()).summary.AVAILABLE).toBe(30);
    expect((await reserve(bob, ['A1'])).status).toBe(201); // immediately bookable by someone else
    expect((await request(app).post(`/api/bookings/${id}/release`).set('Cookie', alice.cookie)).status).toBe(409); // not pending anymore
    await h.assertConsistent(cat.show._id);
  });
  test("users cannot view or release other users' bookings; admins can view", async () => {
    const id = (await reserve(alice, ['A1'])).body.data.id;
    expect((await request(app).get(`/api/bookings/${id}`).set('Cookie', bob.cookie)).status).toBe(404);
    expect((await request(app).post(`/api/bookings/${id}/release`).set('Cookie', bob.cookie)).status).toBe(404);
    expect((await request(app).get(`/api/bookings/${id}`)).status).toBe(401);
    const admin = await h.createUser('ADMIN');
    const view = await request(app).get(`/api/bookings/${id}`).set('Cookie', admin.cookie);
    expect(view.status).toBe(200);
    expect(view.body.data.show.movie.title).toBe('Test Movie');
    expect((await request(app).post(`/api/bookings/${id}/release`).set('Cookie', admin.cookie)).status).toBe(403);
    expect((await request(app).get('/api/bookings/mine').set('Cookie', bob.cookie)).body.data).toHaveLength(0);
    expect((await request(app).get('/api/bookings/mine').set('Cookie', alice.cookie)).body.data).toHaveLength(1);
  });
  test('expired holds are shown as available and can be taken over without a cleanup run', async () => {
    const id = (await reserve(alice, ['C3'])).body.data.id;
    const past = new Date(Date.now() - 1000);
    await SeatInventory.updateMany({ booking: id }, { holdExpiresAt: past });
    await Booking.updateOne({ _id: id }, { expiresAt: past });
    expect((await seatMap()).seats.find((s) => s.label === 'C3').status).toBe('AVAILABLE');
    expect((await reserve(bob, ['C3'])).status).toBe(201);
    // the stale booking must not release bob's seat when it is cleaned up later
    expect(await expireStaleReservations()).toBe(1);
    expect((await Booking.findById(id)).status).toBe('EXPIRED');
    expect((await seatMap()).seats.find((s) => s.label === 'C3')).toMatchObject({ status: 'HELD' });
    await h.assertConsistent(cat.show._id);
  });
  test('cleanup job expires lapsed reservations and frees seats; GET also lazily expires', async () => {
    const id = (await reserve(alice, ['D1', 'D2'])).body.data.id;
    const past = new Date(Date.now() - 1000);
    await SeatInventory.updateMany({ booking: id }, { holdExpiresAt: past });
    await Booking.updateOne({ _id: id }, { expiresAt: past });
    const got = await request(app).get(`/api/bookings/${id}`).set('Cookie', alice.cookie);
    expect(got.body.data.status).toBe('EXPIRED');
    expect(await SeatInventory.countDocuments({ show: cat.show._id, status: 'AVAILABLE' })).toBe(30);
    expect(await expireStaleReservations()).toBe(0);
    await h.assertConsistent(cat.show._id);
  });
  test('closePendingBooking (used for failed payments in Phase 5) frees seats once, idempotently', async () => {
    const id = (await reserve(alice, ['A1'])).body.data.id;
    expect((await closePendingBooking(id, 'FAILED')).status).toBe('FAILED');
    expect(await closePendingBooking(id, 'FAILED')).toBeNull();
    expect((await seatMap()).summary.AVAILABLE).toBe(30);
  });
});

describe('concurrency', () => {
  test('12 simultaneous requests for the same seat: exactly one succeeds', async () => {
    const users = await Promise.all(Array.from({ length: 12 }, () => h.createUser()));
    const results = await Promise.all(users.map((u) => reserve(u, ['A1'])));
    const codes = results.map((r) => r.status);
    expect(codes.filter((c) => c === 201)).toHaveLength(1);
    expect(codes.filter((c) => c === 409)).toHaveLength(11);
    expect(await SeatInventory.countDocuments({ show: cat.show._id, label: 'A1', status: 'HELD' })).toBe(1);
    expect(await Booking.countDocuments({ status: 'PENDING' })).toBe(1);
    await h.assertConsistent(cat.show._id);
  });
  test('overlapping multi-seat requests are all-or-nothing', async () => {
    const users = await Promise.all(Array.from({ length: 6 }, () => h.createUser()));
    // every request overlaps on A3 with its neighbour; at most 3 disjoint-friendly combos can win
    const sets = [['A1', 'A2', 'A3'], ['A3', 'A4', 'A5'], ['A5', 'A6', 'B1'], ['A1', 'B2'], ['B1', 'B2', 'B3'], ['A2', 'A3']];
    const results = await Promise.all(users.map((u, i) => reserve(u, sets[i])));
    const winners = results.map((r, i) => (r.status === 201 ? sets[i] : null)).filter(Boolean);
    expect(winners.length).toBeGreaterThanOrEqual(1);
    const all = winners.flat();
    expect(new Set(all).size).toBe(all.length); // no seat granted twice
    results.filter((r) => r.status !== 201).forEach((r) => expect(r.status).toBe(409));
    expect(await SeatInventory.countDocuments({ show: cat.show._id, status: 'HELD' })).toBe(all.length); // no leaked partial holds
    await h.assertConsistent(cat.show._id);
  });
  test('concurrent requests for disjoint seats all succeed', async () => {
    const users = await Promise.all(Array.from({ length: 6 }, () => h.createUser()));
    const results = await Promise.all(users.map((u, i) => reserve(u, [`C${i + 1}`, `D${i + 1}`])));
    expect(results.map((r) => r.status)).toEqual(Array(6).fill(201));
    expect(await SeatInventory.countDocuments({ show: cat.show._id, status: 'HELD' })).toBe(12);
    await h.assertConsistent(cat.show._id);
  });
});
