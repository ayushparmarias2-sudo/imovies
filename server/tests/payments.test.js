const app = require('../src/app');
const h = require('./helpers');
const request = h.request;
const config = require('../src/config/env');
const emailService = require('../src/services/emailService');

const { SeatInventory, Booking, Payment, Notification } = h.models;
let cat, alice, bob;
beforeAll(() => h.connectDb('payments'));
afterAll(() => h.disconnectDb());
beforeEach(async () => {
  await h.resetDb();
  config.email.url = '';
  cat = await h.createCatalog({ rows: 5, seatsPerRow: 6, premiumRows: 1 });
  alice = await h.createUser();
  bob = await h.createUser();
});
afterEach(() => jest.restoreAllMocks());

const reserve = async (user, seats, show = cat.show) =>
  (await request(app).post('/api/bookings/reserve').set('Cookie', user.cookie).send({ showId: show.id, seats })).body.data;
const pay = (user, id, outcome = 'SUCCESS') => request(app).post(`/api/bookings/${id}/pay`).set('Cookie', user.cookie).send({ outcome });
const cancel = (user, id) => request(app).post(`/api/bookings/${id}/cancel`).set('Cookie', user.cookie);
const counts = async () => Object.fromEntries((await SeatInventory.aggregate([{ $match: { show: cat.show._id } }, { $group: { _id: '$status', n: { $sum: 1 } } }])).map((x) => [x._id, x.n]));

describe('simulated payment', () => {
  test('success confirms the booking, books the seats, records the payment and notifies', async () => {
    const b = await reserve(alice, ['A1', 'E1']);
    const res = await pay(alice, b.id);
    expect(res.status).toBe(200);
    expect(res.body.data.booking).toMatchObject({ status: 'CONFIRMED', totalAmount: 550 });
    expect(res.body.data.payment).toMatchObject({ status: 'SUCCEEDED', method: 'SIMULATED', amount: 550 });
    expect(res.body.data.payment.transactionRef).toMatch(/^SIM-/);
    expect(await counts()).toMatchObject({ BOOKED: 2, AVAILABLE: 28 });
    const detail = (await request(app).get(`/api/bookings/${b.id}`).set('Cookie', alice.cookie)).body.data;
    expect(detail.payments).toHaveLength(1);
    expect(detail.cancellation.allowed).toBe(true);
    expect(await Notification.countDocuments({ user: alice.user._id, type: 'BOOKING_CONFIRMED' })).toBe(1);
    // booked seats cannot be reserved by anyone, and show as BOOKED
    expect((await request(app).post('/api/bookings/reserve').set('Cookie', bob.cookie).send({ showId: cat.show.id, seats: ['A1'] })).status).toBe(409);
    const map = (await request(app).get(`/api/shows/${cat.show.id}/seats`)).body.data;
    expect(map.seats.find((s) => s.label === 'A1').status).toBe('BOOKED');
    await h.assertConsistent(cat.show._id);
  });
  test('failure marks payment+booking FAILED and releases seats so they can be booked again', async () => {
    const b = await reserve(alice, ['B1', 'B2']);
    const res = await pay(alice, b.id, 'FAILURE');
    expect(res.status).toBe(200);
    expect(res.body.data.payment).toMatchObject({ status: 'FAILED', failureReason: expect.any(String) });
    expect(res.body.data.booking.status).toBe('FAILED');
    expect(await counts()).toMatchObject({ AVAILABLE: 30 });
    expect(await Notification.countDocuments({ type: 'PAYMENT_FAILED' })).toBe(1);
    expect((await reserve(bob, ['B1', 'B2'])).status).toBe('PENDING');
    expect((await pay(alice, b.id)).status).toBe(409); // a failed booking cannot be paid afterwards
    await h.assertConsistent(cat.show._id);
  });
  test('input and ownership checks', async () => {
    const b = await reserve(alice, ['A1']);
    expect((await pay(alice, b.id, 'MAYBE')).status).toBe(400);
    expect((await request(app).post(`/api/bookings/${b.id}/pay`).set('Cookie', alice.cookie).send({})).status).toBe(400);
    expect((await pay(bob, b.id)).status).toBe(404);
    expect((await request(app).post(`/api/bookings/${b.id}/pay`).send({ outcome: 'SUCCESS' })).status).toBe(401);
    expect((await Booking.findById(b.id)).status).toBe('PENDING');
  });
  test('client-supplied amounts are ignored', async () => {
    const b = await reserve(alice, ['A1']);
    const res = await request(app).post(`/api/bookings/${b.id}/pay`).set('Cookie', alice.cookie).send({ outcome: 'SUCCESS', amount: 1 });
    expect(res.body.data.payment.amount).toBe(200);
  });
  test('expired reservation cannot be paid; seats are freed', async () => {
    const b = await reserve(alice, ['C1']);
    const past = new Date(Date.now() - 1000);
    await Booking.updateOne({ _id: b.id }, { expiresAt: past });
    await SeatInventory.updateMany({ booking: b.id }, { holdExpiresAt: past });
    const res = await pay(alice, b.id);
    expect(res.status).toBe(409);
    expect((await Booking.findById(b.id)).status).toBe('EXPIRED');
    expect(await Payment.countDocuments({ booking: b.id })).toBe(0);
    expect(await counts()).toMatchObject({ AVAILABLE: 30 });
  });
  test('paying twice: sequential and concurrent attempts succeed only once', async () => {
    const b = await reserve(alice, ['A1', 'A2']);
    const [r1, r2, r3] = await Promise.all([pay(alice, b.id), pay(alice, b.id), pay(alice, b.id)]);
    expect([r1, r2, r3].filter((r) => r.status === 200)).toHaveLength(1);
    expect([r1, r2, r3].filter((r) => r.status === 409)).toHaveLength(2);
    expect(await Payment.countDocuments({ booking: b.id, status: 'SUCCEEDED' })).toBe(1);
    expect(await Payment.countDocuments({ booking: b.id, status: 'INITIATED' })).toBe(0); // losing attempts are marked FAILED
    expect(await SeatInventory.countDocuments({ show: cat.show._id, status: 'BOOKED' })).toBe(2);
    expect((await pay(alice, b.id)).status).toBe(409);
    await h.assertConsistent(cat.show._id);
  });
});

describe('cancellation', () => {
  test('confirmed booking can be cancelled: seats freed, payment refunded, owner only', async () => {
    const b = await reserve(alice, ['D1', 'D2']);
    await pay(alice, b.id);
    expect((await cancel(bob, b.id)).status).toBe(404);
    const res = await cancel(alice, b.id);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('CANCELLED');
    expect(await counts()).toMatchObject({ AVAILABLE: 30 });
    expect((await Payment.findOne({ booking: b.id })).status).toBe('REFUNDED');
    expect(await Notification.countDocuments({ type: 'BOOKING_CANCELLED' })).toBe(1);
    expect((await cancel(alice, b.id)).status).toBe(409); // already cancelled
    expect((await reserve(bob, ['D1'])).status).toBe('PENDING');
    await h.assertConsistent(cat.show._id);
  });
  test('pending bookings cannot be cancelled this way', async () => {
    const b = await reserve(alice, ['A1']);
    expect((await cancel(alice, b.id)).status).toBe(409);
  });
  test('customers cannot cancel inside the cut-off window; admins can override', async () => {
    const soon = await h.createCatalog({ hoursAhead: 1 }); // show starts in 1h, cut-off is 2h
    const b = await reserve(alice, ['A1'], soon.show);
    await pay(alice, b.id);
    const detail = (await request(app).get(`/api/bookings/${b.id}`).set('Cookie', alice.cookie)).body.data;
    expect(detail.cancellation.allowed).toBe(false);
    const denied = await cancel(alice, b.id);
    expect(denied.status).toBe(409);
    expect(denied.body.message).toMatch(/2 hours/);
    expect((await Booking.findById(b.id)).status).toBe('CONFIRMED');
    const admin = await h.createUser('ADMIN');
    expect((await request(app).post(`/api/admin/bookings/${b.id}/cancel`).set('Cookie', bob.cookie)).status).toBe(403);
    const ok = await request(app).post(`/api/admin/bookings/${b.id}/cancel`).set('Cookie', admin.cookie);
    expect(ok.status).toBe(200);
    expect(ok.body.data.status).toBe('CANCELLED');
    expect(await SeatInventory.countDocuments({ show: soon.show._id, status: 'AVAILABLE' })).toBe(30);
  });
});

describe('email & notifications', () => {
  test('without SMTP the notification is stored and emailStatus is SKIPPED', async () => {
    const b = await reserve(alice, ['A1']);
    await pay(alice, b.id);
    expect((await Notification.findOne({ user: alice.user._id })).emailStatus).toBe('SKIPPED');
  });
  test('SMTP_URL=json: email is built and recorded as SENT', async () => {
    config.email.url = 'json';
    const spy = jest.spyOn(emailService, 'send');
    const b = await reserve(alice, ['A1']);
    await pay(alice, b.id);
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ to: alice.user.email, subject: expect.stringContaining('Booking confirmed') }));
    expect((await Notification.findOne({ user: alice.user._id })).emailStatus).toBe('SENT');
  });
  test('a failing mail server never breaks the booking', async () => {
    jest.spyOn(emailService, 'send').mockRejectedValue(new Error('SMTP down'));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const b = await reserve(alice, ['A1']);
    expect((await pay(alice, b.id)).status).toBe(200);
    expect((await Booking.findById(b.id)).status).toBe('CONFIRMED');
    expect((await Notification.findOne({ user: alice.user._id })).emailStatus).toBe('FAILED');
  });
  test('notification endpoints: own only, unread count, mark read / read-all', async () => {
    const b = await reserve(alice, ['A1']);
    await pay(alice, b.id, 'FAILURE');
    const b2 = await reserve(alice, ['A2']);
    await pay(alice, b2.id);
    expect((await request(app).get('/api/notifications')).status).toBe(401);
    const list = await request(app).get('/api/notifications').set('Cookie', alice.cookie);
    expect(list.body.data).toHaveLength(2);
    expect(list.body.meta.unread).toBe(2);
    expect((await request(app).get('/api/notifications').set('Cookie', bob.cookie)).body.data).toHaveLength(0);
    const id = list.body.data[0].id;
    expect((await request(app).post(`/api/notifications/${id}/read`).set('Cookie', bob.cookie)).status).toBe(404);
    expect((await request(app).post(`/api/notifications/${id}/read`).set('Cookie', alice.cookie)).status).toBe(200);
    expect((await request(app).get('/api/notifications').set('Cookie', alice.cookie)).body.meta.unread).toBe(1);
    expect((await request(app).post('/api/notifications/read-all').set('Cookie', alice.cookie)).body.data.updated).toBe(1);
  });
});

describe('admin bookings & stats', () => {
  test('admin-only listing with status filter, populated details, and stats', async () => {
    const admin = await h.createUser('ADMIN');
    const a = await reserve(alice, ['A1', 'A2']); await pay(alice, a.id);
    const c = await reserve(bob, ['B1']); await pay(bob, c.id, 'FAILURE');
    expect((await request(app).get('/api/admin/bookings')).status).toBe(401);
    expect((await request(app).get('/api/admin/bookings').set('Cookie', alice.cookie)).status).toBe(403);
    const all = await request(app).get('/api/admin/bookings').set('Cookie', admin.cookie);
    expect(all.body.data).toHaveLength(2);
    expect(all.body.data[0].user.email).toBeDefined();
    expect(all.body.data[0].show.movie.title).toBe('Test Movie');
    const confirmed = await request(app).get('/api/admin/bookings?status=CONFIRMED').set('Cookie', admin.cookie);
    expect(confirmed.body.data).toHaveLength(1);
    expect((await request(app).get('/api/admin/bookings?status=BOGUS').set('Cookie', admin.cookie)).status).toBe(400);
    const stats = (await request(app).get('/api/admin/stats').set('Cookie', admin.cookie)).body.data;
    expect(stats).toMatchObject({ movies: 1, theaters: 1, upcomingShows: 1, confirmedRevenue: 400, bookingsByStatus: { CONFIRMED: 1, FAILED: 1 } });
  });
});
