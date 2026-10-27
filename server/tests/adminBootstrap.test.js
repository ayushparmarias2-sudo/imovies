const path = require('path');
const { execFile } = require('child_process');
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const h = require('./helpers');
const ensureAdmin = require('../src/seed/ensureAdmin');
const { AdminBootstrapError } = ensureAdmin;

const request = h.request;
const { User, Movie } = h.models;
const ADMIN_EMAIL = 'Boss@Example.com';
const ADMIN_PASSWORD = 'Bootstrap-pass-1';
const saved = {};

beforeAll(async () => { await h.connectDb('bootstrap'); });
afterAll(() => h.disconnectDb());
beforeEach(async () => {
  await h.resetDb();
  for (const k of ['ADMIN_EMAIL', 'ADMIN_PASSWORD', 'ADMIN_NAME']) saved[k] = process.env[k];
  process.env.ADMIN_EMAIL = ADMIN_EMAIL;
  process.env.ADMIN_PASSWORD = ADMIN_PASSWORD;
  delete process.env.ADMIN_NAME;
});
afterEach(() => { for (const k of Object.keys(saved)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

const hashOf = async (email) => (await User.findOne({ email }).select('+passwordHash').lean()).passwordHash;
const registerCustomer = (email, password) => request(app).post('/api/auth/register').send({ name: 'Eager Customer', email, password });

describe('ensureAdmin: creation and idempotency', () => {
  test('creates the initial admin from validated config with a bcrypt hash and a normalised email', async () => {
    const r = await ensureAdmin();
    expect(r).toEqual({ email: 'boss@example.com', created: true });
    const u = await User.findOne({ email: 'boss@example.com' }).select('+passwordHash');
    expect(u.role).toBe('ADMIN');
    expect(u.passwordHash).not.toContain(ADMIN_PASSWORD);
    expect(await bcrypt.compare(ADMIN_PASSWORD, u.passwordHash)).toBe(true);
    // the admin can really log in through the public API (same email normalisation as login)
    const login = await request(app).post('/api/auth/login').send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    expect(login.status).toBe(200);
    expect(login.body.data.user.role).toBe('ADMIN');
  });

  test('running bootstrap again is safe and never resets the admin password or other fields', async () => {
    await ensureAdmin();
    const before = await User.findOne({ email: 'boss@example.com' }).select('+passwordHash').lean();
    process.env.ADMIN_PASSWORD = 'A-Different-Password-9'; // a changed env var must NOT overwrite credentials
    process.env.ADMIN_NAME = 'Someone Else';
    expect(await ensureAdmin()).toEqual({ email: 'boss@example.com', created: false });
    const after = await User.findOne({ email: 'boss@example.com' }).select('+passwordHash').lean();
    expect(after.passwordHash).toBe(before.passwordHash);
    expect(after.name).toBe(before.name);
    expect(after.role).toBe('ADMIN');
    expect(await User.countDocuments({})).toBe(1);
  });

  test('skips quietly when ADMIN_EMAIL / ADMIN_PASSWORD are not set', async () => {
    delete process.env.ADMIN_PASSWORD;
    expect(await ensureAdmin()).toEqual({ skipped: true });
    expect(await User.countDocuments({})).toBe(0);
  });

  test('rejects weak or malformed config without echoing the password', async () => {
    process.env.ADMIN_PASSWORD = 'short1';
    const err = await ensureAdmin().catch((e) => e);
    expect(err).toBeInstanceOf(AdminBootstrapError);
    expect(err.code).toBe('INVALID_CONFIG');
    expect(err.message).not.toContain('short1');
    process.env.ADMIN_PASSWORD = ADMIN_PASSWORD;
    process.env.ADMIN_EMAIL = 'not-an-email';
    expect((await ensureAdmin().catch((e) => e)).code).toBe('INVALID_CONFIG');
    expect(await User.countDocuments({})).toBe(0);
  });
});

describe('ensureAdmin: a pre-registered customer can never become admin', () => {
  test('existing CUSTOMER with the configured email is NOT promoted; role and password hash are untouched', async () => {
    const reg = await registerCustomer(ADMIN_EMAIL, 'Attacker-pass-1'); // registers before bootstrap runs
    expect(reg.status).toBe(201);
    const before = await hashOf('boss@example.com');

    const err = await ensureAdmin().catch((e) => e);
    expect(err).toBeInstanceOf(AdminBootstrapError);
    expect(err.code).toBe('ADMIN_EMAIL_NOT_ADMIN');
    expect(err.message).toMatch(/NOT promoted/);
    expect(err.message).toMatch(/ADMIN_EMAIL/); // actionable: tells the operator what to do

    const after = await User.findOne({ email: 'boss@example.com' }).select('+passwordHash').lean();
    expect(after.role).toBe('CUSTOMER');
    expect(after.passwordHash).toBe(before);
  });

  test('the squatter keeps no admin access: admin routes stay 403 even after a failed bootstrap', async () => {
    await registerCustomer(ADMIN_EMAIL, 'Attacker-pass-1');
    await ensureAdmin().catch(() => {});
    const login = await request(app).post('/api/auth/login').send({ email: ADMIN_EMAIL, password: 'Attacker-pass-1' });
    expect(login.status).toBe(200);
    expect(login.body.data.user.role).toBe('CUSTOMER');
    const cookie = login.headers['set-cookie'][0].split(';')[0];
    expect((await request(app).get('/api/admin/stats').set('Cookie', cookie)).status).toBe(403);
  });

  test('errors and logs never contain the configured password, the customer password, or any hash', async () => {
    await registerCustomer(ADMIN_EMAIL, 'Attacker-pass-1');
    const hash = await hashOf('boss@example.com');
    const err = await ensureAdmin().catch((e) => e);
    const text = `${err.message} ${err.stack}`;
    for (const secret of [ADMIN_PASSWORD, 'Attacker-pass-1', hash, '$2a$', '$2b$']) expect(text).not.toContain(secret);
  });

  test('other customers cannot gain admin through bootstrap, and bootstrap creates exactly one admin', async () => {
    await registerCustomer('other@example.com', 'Other-pass-1');
    await registerCustomer('another@example.com', 'Another-pass-1');
    expect(await ensureAdmin()).toMatchObject({ created: true });
    expect(await ensureAdmin()).toMatchObject({ created: false });
    expect(await User.find({ role: 'ADMIN' }).distinct('email')).toEqual(['boss@example.com']);
    expect(await User.countDocuments({ role: 'CUSTOMER' })).toBe(2);
  });

  test('an existing ADMIN is left exactly as is (no password reset, role kept)', async () => {
    const u = await User.create({ name: 'Existing Admin', email: 'boss@example.com', passwordHash: await bcrypt.hash('Original-pass-1', 4), role: 'ADMIN' });
    const before = await hashOf('boss@example.com');
    expect(await ensureAdmin()).toEqual({ email: 'boss@example.com', created: false });
    expect(await hashOf('boss@example.com')).toBe(before);
    expect(await bcrypt.compare('Original-pass-1', before)).toBe(true);
    expect((await User.findById(u._id)).role).toBe('ADMIN');
  });
});

describe('ensureAdmin: concurrency', () => {
  test('many simultaneous bootstraps yield exactly one admin account and only idempotent successes', async () => {
    for (let round = 0; round < 8; round++) {
      await h.resetDb();
      const results = await Promise.allSettled(Array.from({ length: 8 }, () => ensureAdmin()));
      expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
      expect(results.filter((r) => r.value.created).length).toBe(1);
      const users = await User.find({}).select('+passwordHash');
      expect(users).toHaveLength(1);
      expect(users[0].role).toBe('ADMIN');
      expect(await bcrypt.compare(ADMIN_PASSWORD, users[0].passwordHash)).toBe(true);
    }
  });

  test('bootstrap racing a customer registering the same email never produces a customer-passworded admin', async () => {
    const outcomes = { adminFirst: 0, customerFirst: 0 };
    for (let round = 0; round < 12; round++) {
      await h.resetDb();
      const [boot, reg] = await Promise.all([ensureAdmin().catch((e) => e), registerCustomer(ADMIN_EMAIL, 'Attacker-pass-1')]);
      const users = await User.find({ email: 'boss@example.com' }).select('+passwordHash');
      expect(users).toHaveLength(1);
      if (users[0].role === 'ADMIN') {
        outcomes.adminFirst++;
        expect(reg.status).toBe(409);
        expect(await bcrypt.compare(ADMIN_PASSWORD, users[0].passwordHash)).toBe(true);
        expect(await bcrypt.compare('Attacker-pass-1', users[0].passwordHash)).toBe(false);
      } else {
        outcomes.customerFirst++;
        expect(boot).toBeInstanceOf(AdminBootstrapError);
        expect(reg.status).toBe(201);
      }
    }
    expect(outcomes.adminFirst + outcomes.customerFirst).toBe(12);
  });
});

describe('admin bootstrap scripts fail closed (real child processes)', () => {
  const serverDir = path.join(__dirname, '..');
  const run = (script) => new Promise((resolve) => {
    const uri = new URL(process.env.TEST_MONGO_URI);
    uri.pathname = `/${h.dbName()}`;
    execFile(process.execPath, [script], {
      cwd: serverDir,
      env: { ...process.env, MONGO_URI: uri.toString(), ADMIN_EMAIL, ADMIN_PASSWORD, SEED_CUSTOMER_EMAIL: '', SEED_CUSTOMER_PASSWORD: '' },
    }, (error, stdout, stderr) => resolve({ code: error ? error.code : 0, stdout, stderr }));
  });

  test('npm run create-admin: exits non-zero, does not promote, prints no secrets', async () => {
    await registerCustomer(ADMIN_EMAIL, 'Attacker-pass-1');
    const before = await hashOf('boss@example.com');
    const r = await run('src/seed/createAdmin.js');
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/NOT promoted/);
    expect(`${r.stdout}${r.stderr}`).not.toMatch(/Attacker-pass-1|Bootstrap-pass-1|\$2[aby]\$/);
    const u = await User.findOne({ email: 'boss@example.com' }).select('+passwordHash').lean();
    expect(u.role).toBe('CUSTOMER');
    expect(u.passwordHash).toBe(before);
  });

  test('npm run seed: aborts before seeding anything and does not promote', async () => {
    await registerCustomer(ADMIN_EMAIL, 'Attacker-pass-1');
    const r = await run('src/seed/seed.js');
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/Seed failed/);
    expect((await User.findOne({ email: 'boss@example.com' })).role).toBe('CUSTOMER');
    expect(await Movie.countDocuments({})).toBe(0);
  });

  test('npm run create-admin on a clean database creates the admin; a second run is a no-op', async () => {
    const first = await run('src/seed/createAdmin.js');
    expect(first.code).toBe(0);
    expect(first.stdout).toMatch(/created/);
    const hash = await hashOf('boss@example.com');
    const second = await run('src/seed/createAdmin.js');
    expect(second.code).toBe(0);
    expect(second.stdout).toMatch(/already exists/);
    expect(await hashOf('boss@example.com')).toBe(hash);
  });
});
