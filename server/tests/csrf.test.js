const request = require('supertest'); // raw supertest on purpose: we control the Origin header ourselves
const app = require('../src/app');
const h = require('./helpers');

const ALLOWED = 'http://localhost:5173';
const { Show } = h.models;
let cat; let admin; let customer;

beforeAll(async () => {
  await h.connectDb('csrf');
});
afterAll(() => h.disconnectDb());
beforeEach(async () => {
  await h.resetDb();
  cat = await h.createCatalog();
  admin = await h.createUser('ADMIN');
  customer = await h.createUser('CUSTOMER');
});

const withEnv = (vars, fn) => {
  const saved = process.env.CLIENT_ORIGIN;
  process.env.CLIENT_ORIGIN = vars;
  try { let out; jest.isolateModules(() => { out = fn(require('../src/config/env')); }); return out; }
  finally { if (saved === undefined) delete process.env.CLIENT_ORIGIN; else process.env.CLIENT_ORIGIN = saved; }
};

describe('unsafe, cookie-authenticated requests', () => {
  test('allowed Origin: accepted', async () => {
    const res = await request(app).post('/api/notifications/read-all').set('Cookie', customer.cookie).set('Origin', ALLOWED);
    expect(res.status).toBe(200);
  });

  test('foreign Origin: rejected with 403 and the action does not run', async () => {
    const res = await request(app).delete(`/api/shows/${cat.show.id}`).set('Cookie', admin.cookie).set('Origin', 'https://evil.example');
    expect(res.status).toBe(403);
    expect(await Show.exists({ _id: cat.show._id })).toBeTruthy();
  });

  test.each(['post', 'put', 'patch', 'delete'])('MISSING Origin on %s with the auth cookie: rejected', async (method) => {
    const res = await request(app)[method](`/api/shows/${cat.show.id}`).set('Cookie', admin.cookie);
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/Origin header required/);
    expect(await Show.exists({ _id: cat.show._id })).toBeTruthy();
  });

  test('the same admin request succeeds once a legitimate Origin is present', async () => {
    const res = await request(app).delete(`/api/shows/${cat.show.id}`).set('Cookie', admin.cookie).set('Origin', ALLOWED);
    expect(res.status).toBe(200);
    expect(await Show.exists({ _id: cat.show._id })).toBeNull();
  });

  test('a stale or garbage auth cookie without Origin is still rejected (cookie presence is what matters)', async () => {
    expect((await request(app).post('/api/auth/logout').set('Cookie', 'token=garbage')).status).toBe(403);
    expect((await request(app).post('/api/auth/logout').set('Cookie', customer.cookie)).status).toBe(403);
    expect((await request(app).post('/api/auth/logout').set('Cookie', customer.cookie).set('Origin', ALLOWED)).status).toBe(200);
  });

  test.each([
    ['null origin (sandboxed iframes, redirects)', 'null'],
    ['lookalike suffix', 'http://localhost:5173.evil.test'],
    ['lookalike prefix', 'http://evil-localhost:5173'],
    ['trailing slash is not a serialised origin', 'http://localhost:5173/'],
    ['different case', 'HTTP://LOCALHOST:5173'],
    ['different scheme', 'https://localhost:5173'],
    ['different port', 'http://localhost:5174'],
    ['list injection', `${ALLOWED}, https://evil.example`],
    ['empty', ''],
  ])('exact matching only: %s', async (_name, origin) => {
    const res = await request(app).post('/api/notifications/read-all').set('Cookie', customer.cookie).set('Origin', origin);
    expect(res.status).toBe(403);
  });
});

describe('authentication stays independent of the CSRF check', () => {
  test('no cookie, no Origin, protected route: 401 from auth (not a CSRF 403)', async () => {
    expect((await request(app).post('/api/bookings/reserve').send({ showId: cat.show.id, seats: ['A1'] })).status).toBe(401);
  });
  test('valid Origin does not bypass authorization: a customer is still 403 on admin routes', async () => {
    const res = await request(app).delete(`/api/shows/${cat.show.id}`).set('Cookie', customer.cookie).set('Origin', ALLOWED);
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/permission/);
    expect(await Show.exists({ _id: cat.show._id })).toBeTruthy();
  });
});

describe('login and registration', () => {
  const creds = { name: 'Csrf Tester', email: 'csrf@example.com', password: 'Passw0rd1' };
  test('from the app origin: works and sets the session cookie', async () => {
    const reg = await request(app).post('/api/auth/register').set('Origin', ALLOWED).send(creds);
    expect(reg.status).toBe(201);
    expect(reg.headers['set-cookie'][0]).toMatch(/token=/);
    const login = await request(app).post('/api/auth/login').set('Origin', ALLOWED).send(creds);
    expect(login.status).toBe(200);
  });
  test('from a foreign origin: rejected (prevents login CSRF / forced registration)', async () => {
    const bad = { Origin: 'https://evil.example' };
    expect((await request(app).post('/api/auth/login').set(bad).send(creds)).status).toBe(403);
    expect((await request(app).post('/api/auth/register').set(bad).send(creds)).status).toBe(403);
  });
  test('cookie-less scripts without Origin can still call the public endpoints (nothing ambient to abuse)', async () => {
    expect((await request(app).post('/api/auth/register').send(creds)).status).toBe(201);
    expect((await request(app).post('/api/auth/login').send(creds)).status).toBe(200);
  });
  test('but a client that already holds a session cookie must send Origin even to login/register', async () => {
    expect((await request(app).post('/api/auth/login').set('Cookie', customer.cookie).send(creds)).status).toBe(403);
  });
});

describe('safe methods and CORS preflight', () => {
  test('GET/HEAD work with or without Origin and are never blocked by the CSRF check', async () => {
    expect((await request(app).get('/api/auth/me').set('Cookie', customer.cookie)).status).toBe(200);
    expect((await request(app).get('/api/auth/me').set('Cookie', customer.cookie).set('Origin', ALLOWED)).status).toBe(200);
    expect((await request(app).head('/api/health')).status).toBe(200);
  });
  test('a foreign page can send a GET but gets no CORS permission to read the response', async () => {
    const res = await request(app).get('/api/auth/me').set('Cookie', customer.cookie).set('Origin', 'https://evil.example');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
  test('preflight: allowed origin gets credentials + method; foreign origin gets nothing', async () => {
    const ok = await request(app).options('/api/bookings/reserve').set('Origin', ALLOWED)
      .set('Access-Control-Request-Method', 'POST').set('Access-Control-Request-Headers', 'content-type');
    expect(ok.status).toBe(204);
    expect(ok.headers['access-control-allow-origin']).toBe(ALLOWED);
    expect(ok.headers['access-control-allow-credentials']).toBe('true');
    expect(ok.headers['access-control-allow-methods']).toMatch(/POST/);
    const bad = await request(app).options('/api/bookings/reserve').set('Origin', 'https://evil.example').set('Access-Control-Request-Method', 'POST');
    expect(bad.headers['access-control-allow-origin']).toBeUndefined();
    expect(bad.headers['access-control-allow-credentials']).toBeUndefined();
  });
});

describe('allowlist configuration', () => {
  test('CLIENT_ORIGIN entries are normalised to exact serialised origins', () => {
    const c = withEnv(' http://LOCALHOST:5173/ , https://App.Example.com ', (cfg) => cfg);
    expect(c.clientOrigins).toEqual(['http://localhost:5173', 'https://app.example.com']);
    expect(() => c.validate.call(c)).not.toThrow(/CLIENT_ORIGIN/);
  });
  test.each(['*', 'https://app.example.com/path', 'app.example.com', 'ftp://x.example'])('invalid CLIENT_ORIGIN %s is refused at startup', (bad) => {
    const run = () => withEnv(`https://ok.example.com,${bad}`, (cfg) => { process.env.MONGO_URI = 'mongodb://x/y'; return cfg.validate(); });
    expect(run).toThrow(/CLIENT_ORIGIN/);
  });
});
