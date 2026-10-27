const { test, expect } = require('@playwright/test');
const { uid, newCustomer, newAdmin, freshShow, reserveApi, originOf } = require('./helpers');

const FAKE_ID = 'a'.repeat(24);

test.describe('authorization (real HTTP endpoints, not just hidden links)', () => {
  test('anonymous users cannot use protected or admin endpoints', async ({ browser, baseURL }) => {
    const context = await browser.newContext({ baseURL });
    const h = originOf(baseURL);
    const r = context.request;
    const expectStatus = async (promise, code, label) => expect((await promise).status(), label).toBe(code);
    await expectStatus(r.get('/api/auth/me'), 401, 'me');
    await expectStatus(r.get('/api/bookings/mine'), 401, 'mine');
    await expectStatus(r.get(`/api/bookings/${FAKE_ID}`), 401, 'booking detail');
    await expectStatus(r.post('/api/bookings/reserve', { data: { showId: FAKE_ID, seats: ['A1'] }, headers: h }), 401, 'reserve');
    await expectStatus(r.post(`/api/bookings/${FAKE_ID}/pay`, { data: { outcome: 'SUCCESS' }, headers: h }), 401, 'pay');
    await expectStatus(r.post(`/api/bookings/${FAKE_ID}/cancel`, { headers: h }), 401, 'cancel');
    await expectStatus(r.get('/api/notifications'), 401, 'notifications');
    for (const [m, u] of [['get', '/api/admin/stats'], ['get', '/api/admin/bookings'], ['post', `/api/admin/bookings/${FAKE_ID}/cancel`],
      ['post', '/api/movies'], ['put', `/api/movies/${FAKE_ID}`], ['delete', `/api/movies/${FAKE_ID}`], ['post', '/api/theaters'], ['delete', `/api/theaters/${FAKE_ID}`],
      ['post', '/api/shows'], ['delete', `/api/shows/${FAKE_ID}`]]) {
      await expectStatus(r[m](u, { headers: h, ...(m === 'post' || m === 'put' ? { data: {} } : {}) }), 401, `${m} ${u}`);
    }
    const page = await context.newPage();
    await page.goto('/admin'); await expect(page).toHaveURL(/\/login$/);
    await page.goto('/bookings'); await expect(page).toHaveURL(/\/login$/);
    await context.close();
  });

  test('customers get 403 on every admin API and see "Admins only" in the UI', async ({ browser, baseURL }) => {
    const c = await newCustomer(browser, baseURL);
    const h = originOf(baseURL);
    const r = c.context.request;
    for (const [m, u] of [['get', '/api/admin/stats'], ['get', '/api/admin/bookings'], ['post', `/api/admin/bookings/${FAKE_ID}/cancel`],
      ['post', '/api/movies'], ['put', `/api/movies/${FAKE_ID}`], ['delete', `/api/movies/${FAKE_ID}`], ['post', '/api/theaters'], ['put', `/api/theaters/${FAKE_ID}`],
      ['delete', `/api/theaters/${FAKE_ID}`], ['post', '/api/shows'], ['delete', `/api/shows/${FAKE_ID}`]]) {
      const res = await r[m](u, { headers: h, ...(m === 'post' || m === 'put' ? { data: {} } : {}) });
      expect(res.status(), `${m} ${u}`).toBe(403);
    }
    await c.page.goto('/admin');
    await expect(c.page.getByRole('heading', { name: 'Admins only' })).toBeVisible();
    await expect(c.page.getByRole('link', { name: 'Admin', exact: true })).toHaveCount(0);
    await c.context.close();
  });

  test('role cannot be self-assigned at registration; hostile and invalid input is rejected', async ({ browser, baseURL }) => {
    const context = await browser.newContext({ baseURL });
    const h = originOf(baseURL);
    const email = `e2e-${uid()}@example.test`;
    const reg = await context.request.post('/api/auth/register', { data: { name: 'Mallory', email, password: 'Passw0rd1', role: 'ADMIN' }, headers: h });
    expect((await reg.json()).data.user.role).toBe('CUSTOMER');
    expect((await context.request.get('/api/admin/stats')).status()).toBe(403);
    const inj = await context.request.post('/api/auth/login', { data: { email: { $ne: null }, password: { $ne: null } }, headers: h });
    expect(inj.status()).toBe(400);
    expect((await context.request.post('/api/auth/login', { data: '{bad json', headers: h })).status()).toBe(400);
    const big = await context.request.post('/api/auth/login', { data: { email: 'a@b.co', password: 'x'.repeat(80_000) }, headers: h });
    expect(big.status()).toBe(413);
    const foreign = await context.request.post('/api/auth/logout', { headers: { ...h, Origin: 'https://evil.example' } });
    expect(foreign.status()).toBe(403);
    // CSRF: a cookie-authenticated mutation with NO Origin header is refused; the same call from the app origin works
    const noOrigin = await context.request.post('/api/auth/logout', { headers: { 'Content-Type': 'application/json' } });
    expect(noOrigin.status()).toBe(403);
    expect((await context.request.get('/api/auth/me')).status()).toBe(200); // session untouched by the rejected request
    expect((await context.request.get('/api/movies/not-an-id')).status()).toBe(400);
    // Express 5 parses query strings "simply": operator-style keys never become objects, so they cannot reach MongoDB
    const plain = (await (await context.request.get('/api/movies')).json()).meta.total;
    const hostile = await context.request.get('/api/movies?genre[$ne]=x&search[$regex]=.*');
    expect(hostile.status()).toBe(200);
    expect((await hostile.json()).meta.total).toBe(plain); // ignored, not interpreted
    const res = await context.request.get('/api/definitely-missing');
    expect(res.status()).toBe(404);
    expect(JSON.stringify(await res.json())).not.toMatch(/stack|node_modules|\/home\//);
    const cookies = await context.cookies();
    const tok = cookies.find((c) => c.name === 'token');
    expect(tok.httpOnly).toBe(true);
    await context.close();
  });

  test('admin API validation: bad movie, past show, bad ids', async ({ browser, baseURL }) => {
    const admin = await newAdmin(browser, baseURL);
    const bad = await admin.post('/api/movies', { title: '', genres: [], durationMinutes: 5 });
    expect(bad.status()).toBe(400);
    expect((await bad.json()).errors.length).toBeGreaterThan(2);
    const show = await freshShow(browser, baseURL);
    const past = await admin.post('/api/shows', { movie: show.movie.id, theater: show.theater.id, screenName: show.screenName, startsAt: new Date(Date.now() - 3600_000).toISOString(), pricing: { standard: 100, premium: 200 } });
    expect(past.status()).toBe(400);
    expect((await admin.del('/api/shows/zzz')).status()).toBe(400);
    expect((await admin.get('/api/admin/bookings?status=NOPE')).status()).toBe(400);
    await admin.context.close();
  });
});

test.describe('admin dashboard (real browser)', () => {
  test('stats + movie, theater and show lifecycle with confirmation dialogs', async ({ browser, baseURL }) => {
    const admin = await newAdmin(browser, baseURL);
    const { page } = admin;
    const tag = uid();
    const movieTitle = `E2E Movie ${tag}`; const theaterName = `E2E Theater ${tag}`;
    await page.goto('/admin');
    await expect(page.getByText('Active movies')).toBeVisible();
    await expect(page.getByText('Confirmed revenue (simulated)')).toBeVisible();

    // --- movies
    await page.getByRole('tab', { name: 'Movies' }).click();
    await page.getByRole('button', { name: '+ Add movie' }).click();
    await page.getByLabel('Title').fill(movieTitle);
    await page.getByLabel(/Description/).fill('A movie created by the end-to-end test.');
    await page.getByLabel('Duration (minutes)').fill('10'); // below the minimum
    const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10); // newest released movie => first page
    await page.getByLabel('Release date').fill(yesterday);
    await page.getByLabel('Comedy').check();
    await page.getByRole('button', { name: 'Create movie' }).click();
    expect(await page.getByLabel('Duration (minutes)').evaluate((el) => el.validity.rangeUnderflow)).toBe(true); // browser blocks it
    await page.getByLabel('Duration (minutes)').fill('95');
    await page.getByRole('button', { name: 'Create movie' }).click();
    await expect(page.getByText('Movie created.')).toBeVisible();
    const row = () => page.getByRole('row', { name: new RegExp(movieTitle) });
    await expect(row()).toBeVisible();
    await row().getByRole('button', { name: 'Edit' }).click();
    await page.getByLabel('Title').fill(`${movieTitle} (edited)`);
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Movie updated.')).toBeVisible();

    // --- theater
    await page.getByRole('tab', { name: 'Theaters' }).click();
    await page.getByRole('button', { name: '+ Add theater' }).click();
    await page.getByLabel('Name', { exact: true }).first().fill(theaterName);
    await page.getByLabel('Address').fill('1 Test Street, Indore');
    await page.getByRole('button', { name: 'Create theater' }).click();
    await expect(page.getByRole('row', { name: new RegExp(theaterName) })).toBeVisible();

    // --- show
    await page.getByRole('tab', { name: 'Shows' }).click();
    await page.getByRole('button', { name: '+ Add show' }).click();
    await page.getByLabel('Movie (released only)').selectOption({ label: `${movieTitle} (edited)` });
    await page.getByLabel('Theater').selectOption({ label: theaterName });
    await page.getByLabel('Screen').selectOption('Screen 1');
    const d = new Date(Date.now() + 9 * 864e5); d.setHours(18, 0, 0, 0);
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    await page.getByLabel('Start (your local time)').fill(local);
    await page.getByRole('button', { name: 'Create show' }).click();
    await expect(page.getByText('Show created with its seat inventory.')).toBeVisible();
    const showRow = page.getByRole('row', { name: new RegExp(`${movieTitle} \\(edited\\)`) });
    await expect(showRow).toContainText('96');

    // movie with shows cannot be deleted (server refuses, UI explains)
    await page.getByRole('tab', { name: 'Movies' }).click();
    const editedRow = page.getByRole('row', { name: new RegExp(`${movieTitle} \\(edited\\)`) });
    page.once('dialog', (dlg) => dlg.accept());
    await editedRow.getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText(/has shows and cannot be deleted/)).toBeVisible();

    // delete show: dismiss first, then accept
    await page.getByRole('tab', { name: 'Shows' }).click();
    page.once('dialog', (dlg) => dlg.dismiss());
    await showRow.getByRole('button', { name: 'Delete' }).click();
    await expect(showRow).toBeVisible();
    page.once('dialog', (dlg) => dlg.accept());
    await showRow.getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText('Show deleted.')).toBeVisible();
    await expect(showRow).toHaveCount(0);

    // now movie and theater can be deleted
    await page.getByRole('tab', { name: 'Movies' }).click();
    page.once('dialog', (dlg) => dlg.accept());
    await editedRow.getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText('Movie deleted.')).toBeVisible();
    await page.getByRole('tab', { name: 'Theaters' }).click();
    page.once('dialog', (dlg) => dlg.accept());
    await page.getByRole('row', { name: new RegExp(theaterName) }).getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText('Theater deleted.')).toBeVisible();
    await admin.context.close();
  });

  test('admin bookings tab lists a customer booking and cancels it (after confirmation)', async ({ browser, baseURL }) => {
    const admin = await newAdmin(browser, baseURL);
    const c = await newCustomer(browser, baseURL);
    const show = await freshShow(browser, baseURL);
    const b = (await (await reserveApi(c, show.id, ['F1'])).json()).data;
    await c.post(`/api/bookings/${b.id}/pay`, { outcome: 'SUCCESS' });
    await admin.page.goto('/admin');
    await admin.page.getByRole('tab', { name: 'Bookings' }).click();
    await admin.page.getByLabel('Filter by status').selectOption('CONFIRMED');
    const row = admin.page.getByRole('row', { name: new RegExp(b.reference) });
    await expect(row).toContainText(c.user.email);
    admin.page.once('dialog', (d) => d.dismiss());
    await row.getByRole('button', { name: 'Cancel' }).click();
    await expect(row).toBeVisible();
    admin.page.once('dialog', (d) => d.accept());
    await row.getByRole('button', { name: 'Cancel' }).click();
    await expect(admin.page.getByText(`Booking ${b.reference} cancelled.`)).toBeVisible();
    expect((await (await c.get(`/api/bookings/${b.id}`)).json()).data.status).toBe('CANCELLED');
    await Promise.all([admin.context.close(), c.context.close()]);
  });
});
