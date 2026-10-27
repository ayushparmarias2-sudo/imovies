// Limits are read from the environment when the app is first loaded, so set them before requiring it.
process.env.AUTH_RATE_LIMIT_MAX = '3';
process.env.RESERVE_RATE_LIMIT_MAX = '2';
const app = require('../src/app');
const h = require('./helpers');
const request = h.request;

beforeAll(() => h.connectDb('ratelimit'));
afterAll(() => h.disconnectDb());

test('login/register are rate limited per client (429 after the limit, generic JSON body, standard headers)', async () => {
  const bad = () => request(app).post('/api/auth/login').send({ email: 'nobody@example.com', password: 'Whatever1' });
  const codes = [];
  for (let i = 0; i < 5; i++) codes.push((await bad()).status);
  expect(codes).toEqual([401, 401, 401, 429, 429]);
  const blocked = await bad();
  expect(blocked.body).toEqual({ success: false, message: 'Too many attempts. Please try again later.' });
  expect(blocked.headers['ratelimit']).toBeDefined();
  expect((await request(app).post('/api/auth/register').send({ name: 'X Y', email: 'x@y.co', password: 'Passw0rd1' })).status).toBe(429); // shared budget
});

test('seat reservation endpoint is rate limited per client', async () => {
  const { cookie } = await h.createUser();
  const reserve = () => request(app).post('/api/bookings/reserve').set('Cookie', cookie).send({});
  expect([(await reserve()).status, (await reserve()).status, (await reserve()).status]).toEqual([400, 400, 429]);
});
