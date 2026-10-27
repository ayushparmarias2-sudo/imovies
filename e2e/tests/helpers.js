const { expect } = require('@playwright/test');

// No built-in credentials: pass the admin you seeded with `npm run seed` (ADMIN_EMAIL / ADMIN_PASSWORD) as E2E_ADMIN_*.
const ADMIN = { email: process.env.E2E_ADMIN_EMAIL, password: process.env.E2E_ADMIN_PASSWORD };
if (!ADMIN.email || !ADMIN.password) throw new Error('Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD to the seeded admin account (see README, "Browser tests").');
const PASSWORD = 'Passw0rd1';
let counter = 0;
const uid = () => `${Date.now().toString(36)}${(++counter).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/** Headers the API's CSRF/Origin check expects from a browser on the app origin. */
const originOf = (baseURL) => ({ Origin: new URL(baseURL).origin, 'Content-Type': 'application/json' });

async function json(res) { try { return await res.json(); } catch { return null; } }

/** Registers a customer through the API; the session cookie lands in the context (so pages are logged in). */
async function registerApi(context, baseURL, name = 'E2E Shopper') {
  const email = `e2e-${uid()}@example.test`;
  const res = await context.request.post('/api/auth/register', { data: { name, email, password: PASSWORD }, headers: originOf(baseURL) });
  expect(res.status(), 'register').toBe(201);
  return { email, password: PASSWORD, name };
}
async function loginAdminApi(context, baseURL) {
  const res = await context.request.post('/api/auth/login', { data: ADMIN, headers: originOf(baseURL) });
  expect(res.status(), 'admin login (is the admin seeded? see README)').toBe(200);
}
async function newCustomer(browser, baseURL, viewport) {
  const context = await browser.newContext({ baseURL, ...(viewport ? { viewport } : {}) });
  const user = await registerApi(context, baseURL);
  const page = await context.newPage();
  return { context, page, user, post: (url, data) => context.request.post(url, { data, headers: originOf(baseURL) }), get: (url) => context.request.get(url) };
}
async function newAdmin(browser, baseURL) {
  const context = await browser.newContext({ baseURL });
  await loginAdminApi(context, baseURL);
  const page = await context.newPage();
  return { context, page, post: (url, data) => context.request.post(url, { data, headers: originOf(baseURL) }), get: (url) => context.request.get(url), del: (url) => context.request.delete(url, { headers: originOf(baseURL) }) };
}

/** Deterministic show choice from the seed data: index counts from the END of the upcoming list (the UI-journey test uses the front). */
async function pickShow(ctx, fromEnd = 0) {
  const shows = (await (await ctx.get('/api/shows?limit=100')).json()).data;
  return shows[shows.length - 1 - fromEnd];
}
const seatsOf = async (ctx, showId) => (await (await ctx.get(`/api/shows/${showId}/seats`)).json()).data;
const reserveApi = (ctx, showId, seats) => ctx.post('/api/bookings/reserve', { showId, seats });

/**
 * Creates an isolated show: a brand-new theater (one 6x10 screen) + one show, so tests never depend on or collide with
 * leftover seats/shows from other runs. `minutes` = starts that many minutes from now (default: random day 20-300 ahead).
 */
async function createFreshShow(admin, { minutes } = {}) {
  const tag = uid();
  const th = await admin.post('/api/theaters', { name: `E2E Hall ${tag}`, city: 'Testville', address: '1 Isolation Road', screens: [{ name: 'Screen 1', rows: 6, seatsPerRow: 10, premiumRows: 1 }] });
  expect(th.status(), 'create e2e theater').toBe(201);
  const theater = (await th.json()).data;
  const movies = (await (await admin.get('/api/movies?status=nowShowing&limit=5')).json()).data;
  const startsAt = minutes ? new Date(Date.now() + minutes * 60000) : new Date(Date.now() + (20 + Math.floor(Math.random() * 280)) * 864e5);
  const res = await admin.post('/api/shows', { movie: movies[0].id, theater: theater.id, screenName: 'Screen 1', startsAt: startsAt.toISOString(), pricing: { standard: 200, premium: 350 } });
  expect(res.status(), 'create e2e show').toBe(201);
  return (await res.json()).data;
}
/** Convenience for tests that only hold a browser: makes an admin context, creates the show, closes it. */
async function freshShow(browser, baseURL, opts) {
  const admin = await newAdmin(browser, baseURL);
  try { return await createFreshShow(admin, opts); } finally { await admin.context.close(); }
}
/** Free seat labels (any show) for tests that run against seeded data. */
async function freeSeats(ctx, showId, n = 1) {
  return (await seatsOf(ctx, showId)).seats.filter((s) => s.status === 'AVAILABLE').slice(0, n).map((s) => s.label);
}

const seatButton = (page, label) => page.getByRole('button', { name: new RegExp(`^Seat ${label},`) });

module.exports = { ADMIN, PASSWORD, uid, registerApi, loginAdminApi, newCustomer, newAdmin, pickShow, seatsOf, reserveApi, createFreshShow, freshShow, freeSeats, seatButton, json, originOf };
