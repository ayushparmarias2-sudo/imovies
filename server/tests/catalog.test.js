const app = require('../src/app');
const h = require('./helpers');
const request = h.request;

let admin, customer, cat;
beforeAll(() => h.connectDb('catalog'));
afterAll(() => h.disconnectDb());
beforeEach(async () => {
  await h.resetDb();
  admin = await h.createUser('ADMIN');
  customer = await h.createUser('CUSTOMER');
  cat = await h.createCatalog({ rows: 4, seatsPerRow: 5, premiumRows: 1 });
});

const movieBody = { title: 'New Film', description: 'A brand new test film.', genres: ['Comedy'], durationMinutes: 100, language: 'Hindi', releaseDate: '2024-01-01' };

describe('movies', () => {
  test('public list supports search, genre, status filters and pagination meta', async () => {
    await h.models.Movie.create({ ...movieBody, title: 'Comedy Night', releaseDate: new Date(Date.now() + 5 * 864e5) });
    expect((await request(app).get('/api/movies?search=test')).body.data).toHaveLength(1);
    expect((await request(app).get('/api/movies?search=zzz')).body.data).toHaveLength(0);
    expect((await request(app).get('/api/movies?genre=Comedy')).body.data).toHaveLength(1);
    expect((await request(app).get('/api/movies?status=upcoming')).body.data[0].title).toBe('Comedy Night');
    expect((await request(app).get('/api/movies?status=nowShowing')).body.data[0].title).toBe('Test Movie');
    const withShows = await request(app).get('/api/movies?availability=withShows');
    expect(withShows.body.data.map((m) => m.title)).toEqual(['Test Movie']);
    expect(withShows.body.meta).toMatchObject({ page: 1, total: 1 });
  });
  test('regex special characters in search are treated literally; bad params are 400', async () => {
    expect((await request(app).get('/api/movies?search=.*')).body.data).toHaveLength(0);
    expect((await request(app).get('/api/movies?genre=Nope')).status).toBe(400);
    expect((await request(app).get('/api/movies/not-an-id')).status).toBe(400);
    expect((await request(app).get(`/api/movies/${'a'.repeat(24)}`)).status).toBe(404);
  });
  test('only admins can create/update/delete', async () => {
    expect((await request(app).post('/api/movies').send(movieBody)).status).toBe(401);
    expect((await request(app).post('/api/movies').set('Cookie', customer.cookie).send(movieBody)).status).toBe(403);
    const created = await request(app).post('/api/movies').set('Cookie', admin.cookie).send(movieBody);
    expect(created.status).toBe(201);
    const id = created.body.data.id;
    expect((await request(app).put(`/api/movies/${id}`).set('Cookie', customer.cookie).send({ title: 'x' })).status).toBe(403);
    const upd = await request(app).put(`/api/movies/${id}`).set('Cookie', admin.cookie).send({ title: 'Renamed' });
    expect(upd.body.data.title).toBe('Renamed');
    expect((await request(app).delete(`/api/movies/${id}`).set('Cookie', admin.cookie)).status).toBe(200);
  });
  test('admin validation errors are 400; movie with shows cannot be deleted', async () => {
    const bad = await request(app).post('/api/movies').set('Cookie', admin.cookie).send({ ...movieBody, genres: [], durationMinutes: 5 });
    expect(bad.status).toBe(400);
    expect(bad.body.errors.length).toBeGreaterThan(0);
    const del = await request(app).delete(`/api/movies/${cat.movie.id}`).set('Cookie', admin.cookie);
    expect(del.status).toBe(409);
  });
  test('inactive movies are hidden from the public', async () => {
    await h.models.Movie.updateOne({ _id: cat.movie._id }, { isActive: false });
    expect((await request(app).get(`/api/movies/${cat.movie.id}`)).status).toBe(404);
    expect((await request(app).get('/api/movies')).body.data).toHaveLength(0);
    expect((await request(app).get(`/api/movies/${cat.movie.id}`).set('Cookie', admin.cookie)).status).toBe(200);
  });
});

describe('theaters & shows', () => {
  test('theater list is public; creation is admin-only and validated', async () => {
    expect((await request(app).get('/api/theaters')).body.data).toHaveLength(1);
    const body = { name: 'Second Theater', city: 'Bhopal', address: '2 Test Road', screens: [{ name: 'A', rows: 3, seatsPerRow: 4, premiumRows: 1 }] };
    expect((await request(app).post('/api/theaters').set('Cookie', customer.cookie).send(body)).status).toBe(403);
    expect((await request(app).post('/api/theaters').set('Cookie', admin.cookie).send(body)).status).toBe(201);
    const dupScreens = { ...body, name: 'Third', screens: [body.screens[0], body.screens[0]] };
    expect((await request(app).post('/api/theaters').set('Cookie', admin.cookie).send(dupScreens)).status).toBe(400);
    const tooPremium = { ...body, name: 'Fourth', screens: [{ name: 'A', rows: 2, seatsPerRow: 4, premiumRows: 5 }] };
    expect((await request(app).post('/api/theaters').set('Cookie', admin.cookie).send(tooPremium)).status).toBe(400);
  });
  test('show list includes live availability and filters by movie/date', async () => {
    const res = await request(app).get(`/api/shows?movie=${cat.movie.id}`);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].availableSeats).toBe(20);
    expect(res.body.data[0].movie.title).toBe('Test Movie');
    const d = new Date(cat.show.startsAt.getTime() + 330 * 60000).toISOString().slice(0, 10);
    expect((await request(app).get(`/api/shows?date=${d}`)).body.data).toHaveLength(1);
    expect((await request(app).get('/api/shows?date=2001-01-01')).body.data).toHaveLength(0);
    expect((await request(app).get('/api/shows?date=01-01-2030')).status).toBe(400);
  });
  test('admin creates a show: inventory generated with correct prices/categories', async () => {
    const startsAt = new Date(Date.now() + 5 * 864e5).toISOString();
    const res = await request(app).post('/api/shows').set('Cookie', admin.cookie)
      .send({ movie: cat.movie.id, theater: cat.theater.id, screenName: 'Screen 1', startsAt, pricing: { standard: 150, premium: 300 } });
    expect(res.status).toBe(201);
    const seats = await request(app).get(`/api/shows/${res.body.data.id}/seats`);
    expect(seats.body.data.seats).toHaveLength(20);
    expect(seats.body.data.seats.filter((s) => s.category === 'PREMIUM')).toHaveLength(5);
    expect(seats.body.data.seats.find((s) => s.label === 'D1')).toMatchObject({ category: 'PREMIUM', price: 300 });
    expect(seats.body.data.seats.find((s) => s.label === 'A1')).toMatchObject({ category: 'STANDARD', price: 150 });
  });
  test('show validation: past date, bad screen, overlap, duplicate, non-admin', async () => {
    const base = { movie: cat.movie.id, theater: cat.theater.id, screenName: 'Screen 1', pricing: { standard: 150, premium: 300 } };
    const post = (b, c = admin.cookie) => request(app).post('/api/shows').set('Cookie', c).send(b);
    expect((await post({ ...base, startsAt: new Date(Date.now() - 3600000).toISOString() })).status).toBe(400);
    expect((await post({ ...base, startsAt: 'garbage' })).status).toBe(400);
    expect((await post({ ...base, screenName: 'Nope', startsAt: new Date(Date.now() + 9 * 864e5).toISOString() })).status).toBe(400);
    expect((await post({ ...base, startsAt: new Date(cat.show.startsAt.getTime() + 3600000).toISOString() })).status).toBe(409); // overlaps
    expect((await post({ ...base, startsAt: cat.show.startsAt.toISOString() })).status).toBe(409); // same start
    expect((await post({ ...base, startsAt: new Date(Date.now() + 9 * 864e5).toISOString() }, customer.cookie)).status).toBe(403);
    expect((await post({ ...base, pricing: { standard: -5, premium: 1 }, startsAt: new Date(Date.now() + 9 * 864e5).toISOString() })).status).toBe(400);
  });
  test('unique (show, seat) index is enforced by the database', async () => {
    await expect(h.models.SeatInventory.create({ show: cat.show._id, label: 'A1', row: 'A', number: 1, category: 'STANDARD', price: 1 }))
      .rejects.toMatchObject({ code: 11000 });
  });
  test('show deletion removes inventory but is blocked when bookings exist', async () => {
    const del = await request(app).delete(`/api/shows/${cat.show.id}`).set('Cookie', admin.cookie);
    expect(del.status).toBe(200);
    expect(await h.models.SeatInventory.countDocuments({ show: cat.show._id })).toBe(0);
  });
});
