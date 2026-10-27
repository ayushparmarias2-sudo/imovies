const jwt = require('jsonwebtoken');
const request = require('supertest');
const app = require('../src/app');
const h = require('./helpers');

beforeAll(() => h.connectDb('security'));
afterAll(() => h.disconnectDb());
afterEach(() => jest.restoreAllMocks());

const withEnv = (vars, fn) => {
  const saved = {};
  for (const k of Object.keys(vars)) { saved[k] = process.env[k]; if (vars[k] === undefined) delete process.env[k]; else process.env[k] = vars[k]; }
  try { let out; jest.isolateModules(() => { out = fn(require('../src/config/env')); }); return out; }
  finally { for (const k of Object.keys(saved)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } }
};

describe('configuration safety', () => {
  const good = { MONGO_URI: 'mongodb://127.0.0.1/x', JWT_SECRET: 'x'.repeat(40) };
  test('refuses to start without MONGO_URI or with a short/missing JWT_SECRET', () => {
    expect(() => withEnv({ ...good, MONGO_URI: undefined }, (c) => c.validate())).toThrow(/MONGO_URI/);
    expect(() => withEnv({ ...good, JWT_SECRET: 'short' }, (c) => c.validate())).toThrow(/JWT_SECRET/);
    expect(() => withEnv({ ...good, JWT_SECRET: undefined }, (c) => c.validate())).toThrow(/JWT_SECRET/);
    expect(() => withEnv(good, (c) => c.validate())).not.toThrow();
  });
  test('production defaults: cookie is Secure + SameSite=None (cross-site hosting) and SameSite=None without Secure is rejected', () => {
    const prod = withEnv({ ...good, NODE_ENV: 'production', COOKIE_SAMESITE: undefined, COOKIE_SECURE: undefined }, (c) => c.cookie);
    expect(prod).toMatchObject({ sameSite: 'none', secure: true });
    expect(() => withEnv({ ...good, NODE_ENV: 'development', COOKIE_SAMESITE: 'none', COOKIE_SECURE: 'false' }, (c) => c.validate())).toThrow(/COOKIE_SECURE/);
  });
});

describe('transport and headers', () => {
  test('auth cookie is HttpOnly with SameSite and Path; token never appears in the JSON body', async () => {
    await request(app).post('/api/auth/register').send({ name: 'Sec Tester', email: 'sec@example.com', password: 'Passw0rd1' });
    const res = await request(app).post('/api/auth/login').send({ email: 'sec@example.com', password: 'Passw0rd1' });
    const cookie = res.headers['set-cookie'][0];
    expect(cookie).toMatch(/HttpOnly/i); expect(cookie).toMatch(/SameSite=Lax/i); expect(cookie).toMatch(/Path=\//);
    expect(JSON.stringify(res.body)).not.toMatch(/eyJ/); // no JWT in the response body
  });
  test('security headers are set and x-powered-by is hidden', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBeDefined();
    expect(res.headers['strict-transport-security']).toBeDefined();
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
  test('CORS: allowed origin is echoed with credentials; unknown origin gets no CORS headers', async () => {
    const ok = await request(app).get('/api/health').set('Origin', 'http://localhost:5173');
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(ok.headers['access-control-allow-credentials']).toBe('true');
    const bad = await request(app).get('/api/health').set('Origin', 'https://evil.example');
    expect(bad.headers['access-control-allow-origin']).toBeUndefined();
    const pre = await request(app).options('/api/bookings/reserve').set('Origin', 'https://evil.example').set('Access-Control-Request-Method', 'POST');
    expect(pre.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('authentication hardening', () => {
  test('forged tokens are rejected: wrong secret, alg=none, and tokens for deleted users', async () => {
    const { user } = await h.createUser();
    const forged = jwt.sign({ sub: String(user._id) }, 'another-secret-another-secret-another-1');
    expect((await request(app).get('/api/auth/me').set('Cookie', `token=${forged}`)).status).toBe(401);
    const none = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: String(user._id) })).toString('base64url')}.`;
    expect((await request(app).get('/api/auth/me').set('Cookie', `token=${none}`)).status).toBe(401);
    const { cookie } = await h.createUser();
    await h.models.User.deleteMany({});
    expect((await request(app).get('/api/auth/me').set('Cookie', cookie)).status).toBe(401);
  });
  test('an admin role in a forged/unsigned payload grants nothing; role comes from the database', async () => {
    const { user } = await h.createUser('CUSTOMER');
    const t = jwt.sign({ sub: String(user._id), role: 'ADMIN' }, process.env.JWT_SECRET);
    expect((await request(app).get('/api/admin/stats').set('Cookie', `token=${t}`)).status).toBe(403);
  });
});

describe('input and error handling', () => {
  test('operator objects in bodies/params/queries never reach MongoDB (400, not data)', async () => {
    const { cookie } = await h.createUser();
    expect((await h.request(app).post('/api/bookings/reserve').set('Cookie', cookie).send({ showId: { $ne: null }, seats: ['A1'] })).status).toBe(400);
    expect((await h.request(app).post('/api/bookings/reserve').set('Cookie', cookie).send({ showId: 'a'.repeat(24), seats: [{ $gt: '' }] })).status).toBe(400);
    expect((await request(app).post('/api/auth/login').send({ email: { $gt: '' }, password: { $gt: '' } })).status).toBe(400);
    expect((await request(app).get('/api/shows?movie[$ne]=x')).status).toBe(200); // ignored by the query parser, not interpreted
    expect((await request(app).get('/api/movies/%7B%22%24ne%22%3Anull%7D')).status).toBe(400);
  });
  test('unexpected server errors return a generic message: no stack, internals or connection strings', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(h.models.Movie, 'find').mockImplementation(() => { throw new Error('boom mongodb://admin:hunter2@db.internal:27017 /srv/app/secret.js'); });
    const res = await request(app).get('/api/movies');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ success: false, message: 'Internal server error' });
    expect(JSON.stringify(res.body)).not.toMatch(/hunter2|mongodb:|srv|stack/);
  });
  test('request bodies are size limited (413) and malformed JSON is a 400', async () => {
    expect((await request(app).post('/api/auth/login').send({ email: 'a@b.co', password: 'x'.repeat(80000) })).status).toBe(413);
    expect((await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{oops')).status).toBe(400);
  });
});
