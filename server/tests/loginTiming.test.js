// Use a work factor that differs from any hard-coded constant (the old dummy hash was cost 4), so a mismatch is detectable.
// Must be set before the app/config modules are first required.
process.env.BCRYPT_ROUNDS = '5';
const bcrypt = require('bcryptjs');
const app = require('../src/app');
const h = require('./helpers');
const config = require('../src/config/env');
const password = require('../src/utils/password');

const request = h.request;

beforeAll(async () => {
  await h.connectDb('logintiming');
  await request(app).post('/api/auth/register').send({ name: 'Real User', email: 'real@example.com', password: 'Passw0rd1' });
});
afterAll(() => h.disconnectDb());
afterEach(() => jest.restoreAllMocks());

const login = (email, pw) => request(app).post('/api/auth/login').send({ email, password: pw });

describe('login responses are indistinguishable', () => {
  test('unknown email and wrong password give the same status and body', async () => {
    const unknown = await login('nobody@example.com', 'Passw0rd1');
    const wrong = await login('real@example.com', 'Wrong-pass-1');
    expect(unknown.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(unknown.body).toEqual(wrong.body);
    expect(unknown.body.message).toBe('Invalid email or password');
    expect(unknown.headers['set-cookie']).toBeUndefined();
  });
  test('a correct login still works', async () => {
    const ok = await login('REAL@example.com', 'Passw0rd1');
    expect(ok.status).toBe(200);
    expect(ok.headers['set-cookie'][0]).toMatch(/token=/);
  });
});

describe('bcrypt cost is equal on both failure paths (configuration/behaviour, not wall-clock timing)', () => {
  test('both paths call bcrypt.compare with hashes of the same cost as stored user hashes', async () => {
    const spy = jest.spyOn(bcrypt, 'compare');
    await login('nobody@example.com', 'Passw0rd1');
    await login('real@example.com', 'Wrong-pass-1');
    expect(spy).toHaveBeenCalledTimes(2); // the unknown-email path really performs a comparison
    const rounds = spy.mock.calls.map(([, hash]) => bcrypt.getRounds(hash));
    const stored = bcrypt.getRounds((await h.models.User.findOne({ email: 'real@example.com' }).select('+passwordHash')).passwordHash);
    expect(rounds).toEqual([stored, stored]);
    expect(stored).toBe(config.bcryptRounds);
  });

  test('the dummy hash is generated once and cached, not per request', async () => {
    const first = await password.getDummyHash();
    const hashSpy = jest.spyOn(bcrypt, 'hash');
    await login('nobody@example.com', 'x'.repeat(8));
    await login('nobody2@example.com', 'x'.repeat(8));
    expect(hashSpy).not.toHaveBeenCalled();
    expect(await password.getDummyHash()).toBe(first);
  });

  const fresh = (vars) => {
    const saved = process.env.BCRYPT_ROUNDS;
    if (vars.BCRYPT_ROUNDS === undefined) delete process.env.BCRYPT_ROUNDS; else process.env.BCRYPT_ROUNDS = vars.BCRYPT_ROUNDS;
    try { let out; jest.isolateModules(() => { out = { cfg: require('../src/config/env'), pw: require('../src/utils/password') }; }); return out; }
    finally { if (saved === undefined) delete process.env.BCRYPT_ROUNDS; else process.env.BCRYPT_ROUNDS = saved; }
  };

  test('with the production default work factor (12) the dummy and real hashes are both cost 12', async () => {
    const { cfg, pw } = fresh({ BCRYPT_ROUNDS: undefined });
    expect(cfg.bcryptRounds).toBe(12);
    expect(bcrypt.getRounds(await pw.getDummyHash())).toBe(12);
    expect(bcrypt.getRounds(await pw.hashPassword('Passw0rd1'))).toBe(12);
  });

  test('the dummy hash follows a custom BCRYPT_ROUNDS instead of a fixed constant', async () => {
    const { pw } = fresh({ BCRYPT_ROUNDS: '10' });
    expect(bcrypt.getRounds(await pw.getDummyHash())).toBe(10);
  });
});
