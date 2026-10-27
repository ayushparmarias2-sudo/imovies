const { test, expect } = require('@playwright/test');
const { PASSWORD, uid, newCustomer, newAdmin, freshShow, createFreshShow, freeSeats, seatsOf, reserveApi, seatButton } = require('./helpers');

test.describe('customer journey (real browser, real API + MongoDB)', () => {
  test('register via UI, log out/in, bad login rejected', async ({ browser, baseURL }) => {
    const context = await browser.newContext({ baseURL });
    const page = await context.newPage();
    const email = `e2e-${uid()}@example.test`;
    await page.goto('/register');
    await page.getByLabel('Full name').fill('Asha Verma');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill('short');
    await page.getByRole('button', { name: 'Sign up' }).click();
    await expect(page.getByRole('alert')).toContainText(/at least 8 characters/i); // server validation message surfaced
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign up' }).click();
    await expect(page.getByText('Hi, Asha')).toBeVisible();
    await page.getByRole('button', { name: 'Log out' }).click();
    await expect(page.getByRole('link', { name: 'Log in' })).toBeVisible();
    await page.goto('/login');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill('WrongPass1');
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page.getByRole('alert')).toContainText('Invalid email or password');
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page.getByText('Hi, Asha')).toBeVisible();
    await context.close();
  });

  test('seeded movies show real poster artwork (not the gradient placeholder) and posters appear on seat and ticket pages', async ({ browser, baseURL }) => {
    const c = await newCustomer(browser, baseURL);
    const { page } = c;
    await page.goto('/');
    const card = page.locator('.movie-card', { hasText: 'Orbit Station Nine' });
    const img = card.locator('img.poster');
    await expect(img).toHaveAttribute('src', '/posters/orbit-station-nine.svg');
    await expect.poll(() => img.evaluate((el) => el.complete && el.naturalWidth > 0)).toBe(true); // actually decoded, not a broken image
    await card.click();
    await expect(page.locator('img.detail-poster')).toBeVisible();
    await page.getByRole('link', { name: /seats left/ }).first().click();
    await expect(page.locator('img.poster-thumb')).toBeVisible();
    await c.context.close();
  });

  test('full journey: browse → seats → reserve → pay → ticket → notifications → cancel → refund', async ({ browser, baseURL }) => {
    const c = await newCustomer(browser, baseURL);
    const { page } = c;
    await page.goto('/');
    await page.getByLabel('Search by title').fill('orbit');
    await expect(page.locator('.movie-card')).toHaveCount(1);
    await page.locator('.movie-card').click();
    await expect(page.getByRole('heading', { level: 1, name: 'Orbit Station Nine' })).toBeVisible();
    await page.getByRole('link', { name: /seats left/ }).first().click();
    await expect(page.getByRole('heading', { level: 1, name: 'Orbit Station Nine' })).toBeVisible();
    const showId = page.url().match(/shows\/([a-f0-9]+)\/seats/)[1];

    const [s1, s2] = await freeSeats(c, showId, 2); // seeded data may have been used by earlier runs
    await seatButton(page, s1).click();
    await seatButton(page, s2).click();
    await expect(seatButton(page, s1)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: /Reserve 2 seats/ })).toBeEnabled();
    await page.getByRole('button', { name: /Reserve 2 seats/ }).click();

    await expect(page.getByText('PENDING')).toBeVisible();
    const ref = (await page.locator('.font-monospace').first().textContent()).trim();
    expect(ref).toMatch(/^IM-[A-Z2-9]{10}$/);
    await page.reload(); // refresh-safe
    await expect(page.getByText('PENDING')).toBeVisible();
    await page.getByRole('link', { name: 'Proceed to payment' }).click();
    await expect(page.getByText(/Demonstration checkout/)).toBeVisible();
    await expect(page.locator('input[type=text], input[type=tel], input[autocomplete^="cc-"]')).toHaveCount(0); // no card fields
    await page.getByRole('button', { name: /Pay .* \(simulated\)/ }).click();

    await expect(page.getByText(/Payment successful/)).toBeVisible();
    await expect(page.getByText('CONFIRMED', { exact: true })).toBeVisible();
    await expect(page.getByText(/SIM-/)).toBeVisible();
    expect((await seatsOf(c, showId)).summary.BOOKED).toBe(2);

    await expect(page.getByLabel('1 unread')).toBeVisible(); // navbar badge
    await page.getByRole('link', { name: /Notifications/ }).click();
    await expect(page.getByText('Booking confirmed').first()).toBeVisible();
    await page.getByRole('button', { name: 'Mark all read (1)' }).click();
    await expect(page.getByLabel(/unread/)).toHaveCount(0);

    await page.getByRole('link', { name: 'My bookings' }).click();
    await expect(page.getByRole('link', { name: new RegExp(ref) })).toContainText('CONFIRMED');
    await page.getByRole('link', { name: new RegExp(ref) }).click();
    await expect(page.getByText(/Free cancellation until/)).toBeVisible();
    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'Cancel booking' }).click();
    await expect(page.getByText('CANCELLED', { exact: true })).toBeVisible();
    await expect(page.getByText(/refunded/).first()).toBeVisible();
    await expect(page.getByText(/REFUNDED/)).toBeVisible();
    expect((await seatsOf(c, showId)).summary).toMatchObject({ BOOKED: 0, HELD: 0 });
    await c.context.close();
  });

  test('failed payment shows the failure screen and releases the seats', async ({ browser, baseURL }) => {
    const c = await newCustomer(browser, baseURL);
    const show = await freshShow(browser, baseURL);
    const b = (await (await reserveApi(c, show.id, ['C1', 'C2'])).json()).data;
    await c.page.goto(`/bookings/${b.id}/checkout`);
    await c.page.getByLabel(/Payment fails/).check();
    await c.page.getByRole('button', { name: /Pay .* \(simulated\)/ }).click();
    await expect(c.page.getByRole('alert')).toContainText('Payment failed.');
    await expect(c.page.locator('.badge', { hasText: 'FAILED' })).toBeVisible();
    expect((await seatsOf(c, show.id)).summary).toMatchObject({ HELD: 0, BOOKED: 0 });
    await c.page.getByRole('link', { name: 'Choose seats again' }).click();
    await expect(seatButton(c.page, 'C1')).toBeEnabled();
    expect((await c.post(`/api/bookings/${b.id}/pay`, { outcome: 'SUCCESS' })).status()).toBe(409); // cannot pay a failed booking
    await c.context.close();
  });

  test('inside the cancellation cut-off: button disabled with reason, API refuses, admin override works', async ({ browser, baseURL }) => {
    const admin = await newAdmin(browser, baseURL);
    const soon = await createFreshShow(admin, { minutes: 60 });
    const c = await newCustomer(browser, baseURL);
    const b = (await (await reserveApi(c, soon.id, ['A1'])).json()).data;
    expect((await c.post(`/api/bookings/${b.id}/pay`, { outcome: 'SUCCESS' })).status()).toBe(200);
    await c.page.goto(`/bookings/${b.id}`);
    await expect(c.page.getByText(/Cancellation closes 2 hours before the show/)).toBeVisible();
    await expect(c.page.getByRole('button', { name: 'Cancel booking' })).toBeDisabled();
    expect((await c.post(`/api/bookings/${b.id}/cancel`)).status()).toBe(409);
    expect((await admin.post(`/api/admin/bookings/${b.id}/cancel`)).status()).toBe(200);
    await c.page.reload();
    await expect(c.page.getByText('CANCELLED', { exact: true })).toBeVisible();
    expect((await seatsOf(c, soon.id)).summary.AVAILABLE).toBeGreaterThan(0);
    await Promise.all([c.context.close(), admin.context.close()]);
  });

  test('another customer cannot open or pay my booking; expired/released states render', async ({ browser, baseURL }) => {
    const owner = await newCustomer(browser, baseURL);
    const other = await newCustomer(browser, baseURL);
    const show = await freshShow(browser, baseURL);
    const b = (await (await reserveApi(owner, show.id, ['D1'])).json()).data;
    expect((await other.get(`/api/bookings/${b.id}`)).status()).toBe(404);
    expect((await other.post(`/api/bookings/${b.id}/pay`, { outcome: 'SUCCESS' })).status()).toBe(404);
    await other.page.goto(`/bookings/${b.id}`);
    await expect(other.page.getByRole('alert')).toContainText(/not found/i);
    await owner.page.goto(`/bookings/${b.id}`);
    owner.page.once('dialog', (d) => d.accept());
    await owner.page.getByRole('button', { name: 'Release seats' }).click();
    await expect(owner.page.getByText('CANCELLED', { exact: true })).toBeVisible();
    await expect(owner.page.getByText(/reservation was released/)).toBeVisible();
    await Promise.all([owner.context.close(), other.context.close()]);
  });
});
