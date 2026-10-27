const app = require('../src/app');
const h = require('./helpers');
const request = h.request;

beforeAll(() => h.connectDb('auth'));
afterAll(() => h.disconnectDb());
beforeEach(() => h.resetDb());

const valid = { name: 'Asha Verma', email: 'Asha@Example.com', password: 'Secret123' };

describe('registration', () => {
  test('creates a CUSTOMER, sets an HTTP-only cookie, never returns the hash', async () => {
    const res = await request(app).post('/api/auth/register').send(valid);
    expect(res.status).toBe(201);
    expect(res.body.data.user.email).toBe('asha@example.com');
    expect(res.body.data.user.role).toBe('CUSTOMER');
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|Secret123/);
    expect(res.headers['set-cookie'][0]).toMatch(/token=.*HttpOnly/i);
    const stored = await h.models.User.findOne({ email: 'asha@example.com' }).select('+passwordHash');
    expect(stored.passwordHash).not.toBe('Secret123');
  });
  test('cannot self-promote to ADMIN via the role field', async () => {
    const res = await request(app).post('/api/auth/register').send({ ...valid, role: 'ADMIN' });
    expect(res.status).toBe(201);
    expect(res.body.data.user.role).toBe('CUSTOMER');
  });
  test('rejects duplicate email (409) and weak/invalid input (400)', async () => {
    await request(app).post('/api/auth/register').send(valid);
    expect((await request(app).post('/api/auth/register').send(valid)).status).toBe(409);
    expect((await request(app).post('/api/auth/register').send({ ...valid, email: 'b@x.com', password: 'short1' })).status).toBe(400);
    expect((await request(app).post('/api/auth/register').send({ ...valid, email: 'b@x.com', password: 'nodigitshere' })).status).toBe(400);
    expect((await request(app).post('/api/auth/register').send({ ...valid, email: 'not-an-email' })).status).toBe(400);
    expect((await request(app).post('/api/auth/register').send({ email: { $ne: null }, password: 'Secret123', name: 'Eve' })).status).toBe(400);
  });
});

describe('login / session', () => {
  beforeEach(() => request(app).post('/api/auth/register').send(valid));
  test('logs in with correct credentials and /me works with the cookie', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'asha@example.com', password: 'Secret123' });
    expect(res.status).toBe(200);
    const me = await request(app).get('/api/auth/me').set('Cookie', res.headers['set-cookie']);
    expect(me.status).toBe(200);
    expect(me.body.data.user.email).toBe('asha@example.com');
  });
  test('invalid credentials give the same generic 401', async () => {
    const wrongPw = await request(app).post('/api/auth/login').send({ email: 'asha@example.com', password: 'Wrong1234' });
    const noUser = await request(app).post('/api/auth/login').send({ email: 'nobody@example.com', password: 'Secret123' });
    expect(wrongPw.status).toBe(401);
    expect(noUser.status).toBe(401);
    expect(wrongPw.body.message).toBe(noUser.body.message);
  });
  test('/me requires auth; tampered token rejected; logout clears cookie', async () => {
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
    expect((await request(app).get('/api/auth/me').set('Cookie', 'token=garbage')).status).toBe(401);
    const out = await request(app).post('/api/auth/logout');
    expect(out.status).toBe(200);
    expect(out.headers['set-cookie'][0]).toMatch(/token=;/);
  });
  test('disabled accounts cannot log in or use old sessions', async () => {
    const login = await request(app).post('/api/auth/login').send({ email: 'asha@example.com', password: 'Secret123' });
    await h.models.User.updateOne({ email: 'asha@example.com' }, { isActive: false });
    expect((await request(app).get('/api/auth/me').set('Cookie', login.headers['set-cookie'])).status).toBe(401);
    expect((await request(app).post('/api/auth/login').send({ email: 'asha@example.com', password: 'Secret123' })).status).toBe(401);
  });
  test('cross-origin mutating requests from unknown origins are blocked', async () => {
    const res = await request(app).post('/api/auth/logout').set('Origin', 'https://evil.example');
    expect(res.status).toBe(403);
  });
});
