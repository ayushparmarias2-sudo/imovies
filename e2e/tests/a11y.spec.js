const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default || require('@axe-core/playwright');
const { newCustomer, newAdmin, freshShow, createFreshShow, reserveApi, seatButton } = require('./helpers');

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
async function scan(page, label) {
  // scan settled states: with reduced motion the app disables colour transitions, so axe never measures a mid-transition blend
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForTimeout(50);
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const summary = violations.map((v) => `${v.impact}: ${v.id} — ${v.help} (${v.nodes.length} nodes) e.g. ${v.nodes[0].target.join(' ')}`);
  expect(summary, `axe violations on ${label}`).toEqual([]);
}

test.describe('WCAG 2.2 AA automated scans (axe) on real pages', () => {
  test('public pages', async ({ page, browser, baseURL }) => {
    await page.goto('/'); await expect(page.locator('.movie-card').first()).toBeVisible(); await scan(page, 'home');
    await page.locator('.movie-card').first().click(); await expect(page.getByRole('heading', { level: 1 })).toBeVisible(); await scan(page, 'movie details');
    await page.goto('/login'); await scan(page, 'login');
    await page.goto('/register'); await scan(page, 'register');
    await page.getByRole('button', { name: 'Sign up' }).click(); await expect(page.getByRole('alert')).toBeVisible(); await scan(page, 'register with error');
    const c = await newCustomer(browser, baseURL);
    const show = await freshShow(browser, baseURL);
    await page.goto(`/shows/${show.id}/seats`); await expect(seatButton(page, 'A1')).toBeVisible();
    await seatButton(page, 'A1').click(); await scan(page, 'seat selection (with selection)');
    await c.context.close();
  });

  test('customer pages in every booking state', async ({ browser, baseURL }) => {
    const c = await newCustomer(browser, baseURL);
    const { page } = c;
    const show = await freshShow(browser, baseURL);
    const pending = (await (await reserveApi(c, show.id, ['A2'])).json()).data;
    await page.goto(`/bookings/${pending.id}`); await expect(page.getByText('PENDING')).toBeVisible(); await scan(page, 'booking pending');
    await page.goto(`/bookings/${pending.id}/checkout`); await expect(page.getByText(/Demonstration checkout/)).toBeVisible(); await scan(page, 'checkout');
    await c.post(`/api/bookings/${pending.id}/pay`, { outcome: 'SUCCESS' });
    await page.goto(`/bookings/${pending.id}`); await expect(page.getByText('CONFIRMED', { exact: true })).toBeVisible(); await scan(page, 'booking confirmed');
    const failing = (await (await reserveApi(c, show.id, ['A3'])).json()).data;
    await c.post(`/api/bookings/${failing.id}/pay`, { outcome: 'FAILURE' });
    await page.goto(`/bookings/${failing.id}`); await expect(page.getByText('Payment failed.')).toBeVisible(); await scan(page, 'booking failed');
    const admin = await newAdmin(browser, baseURL);
    const soon = await createFreshShow(admin, { minutes: 60 });
    const b2 = (await (await reserveApi(c, soon.id, ['A1'])).json()).data;
    await c.post(`/api/bookings/${b2.id}/pay`, { outcome: 'SUCCESS' });
    await page.goto(`/bookings/${b2.id}`); await expect(page.getByRole('button', { name: 'Cancel booking' })).toBeDisabled(); await scan(page, 'booking confirmed, cancel disabled');
    await page.goto('/bookings'); await expect(page.getByRole('heading', { name: 'My bookings' })).toBeVisible(); await scan(page, 'my bookings');
    await page.goto('/notifications'); await expect(page.getByRole('heading', { name: 'Notifications' })).toBeVisible(); await scan(page, 'notifications');
    await page.goto('/this-page-does-not-exist'); await scan(page, '404');
    await Promise.all([c.context.close(), admin.context.close()]);
  });

  test('admin pages', async ({ browser, baseURL }) => {
    const admin = await newAdmin(browser, baseURL);
    const { page } = admin;
    await page.goto('/admin'); await expect(page.getByText('Active movies')).toBeVisible(); await scan(page, 'admin dashboard');
    for (const tab of ['Movies', 'Theaters', 'Shows', 'Bookings']) {
      await page.getByRole('tab', { name: tab }).click();
      await expect(page.getByRole('heading', { level: 2 })).toBeVisible();
      await scan(page, `admin ${tab}`);
    }
    await page.getByRole('tab', { name: 'Movies' }).click();
    await page.getByRole('button', { name: '+ Add movie' }).click(); await scan(page, 'admin movie form');
    await page.getByRole('tab', { name: 'Theaters' }).click();
    await page.getByRole('button', { name: '+ Add theater' }).click(); await scan(page, 'admin theater form');
    await page.getByRole('tab', { name: 'Shows' }).click();
    await page.getByRole('button', { name: '+ Add show' }).click(); await scan(page, 'admin show form');
    await admin.context.close();
  });
});

test.describe('keyboard and screen-reader behaviour', () => {
  test('skip link works and moves focus into main content', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Skip to content' });
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible();
    await page.keyboard.press('Enter');
    const inMain = await page.evaluate(() => document.getElementById('main').contains(document.activeElement) || document.activeElement === document.getElementById('main'));
    expect(inMain).toBe(true);
  });

  test('each page has a distinct, meaningful document title and route changes are announced to assistive tech', async ({ page }) => {
    const titles = [];
    for (const path of ['/', '/login', '/register']) { await page.goto(path); await page.waitForTimeout(150); titles.push(await page.title()); }
    expect(new Set(titles).size).toBe(3);
    await page.goto('/');
    await page.getByRole('link', { name: 'Log in' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Log in' })).toBeVisible();
    await expect(page).toHaveTitle(/Log in/);
    expect(await page.evaluate(() => document.activeElement.id)).toBe('main'); // focus moved to the new view
  });

  test('seats can be chosen entirely by keyboard, with a visible focus indicator and state announced', async ({ browser, baseURL }) => {
    const c = await newCustomer(browser, baseURL);
    const show = await freshShow(browser, baseURL);
    await c.page.goto(`/shows/${show.id}/seats`);
    await seatButton(c.page, 'A1').focus();
    await c.page.keyboard.press('Tab'); // A1 -> A2 (natural order)
    await expect(seatButton(c.page, 'A2')).toBeFocused();
    const outline = await seatButton(c.page, 'A2').evaluate((el) => { const s = getComputedStyle(el); return { w: parseFloat(s.outlineWidth), st: s.outlineStyle }; });
    expect(outline.st).not.toBe('none'); expect(outline.w).toBeGreaterThanOrEqual(2);
    await c.page.keyboard.press('Space');
    await expect(seatButton(c.page, 'A2')).toHaveAttribute('aria-pressed', 'true');
    await expect(seatButton(c.page, 'A2')).toHaveAccessibleName(/selected/);
    await c.page.keyboard.press('Enter');
    await expect(seatButton(c.page, 'A2')).toHaveAttribute('aria-pressed', 'false');
    await c.context.close();
  });

  test('mobile menu is operable by keyboard and exposes its state', async ({ browser, baseURL }) => {
    const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await page.goto('/');
    const toggler = page.getByRole('button', { name: 'Toggle navigation' });
    await expect(toggler).toHaveAttribute('aria-expanded', 'false');
    await toggler.focus(); await page.keyboard.press('Enter');
    await expect(toggler).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('link', { name: 'Log in' })).toBeVisible();
    await context.close();
  });

  test('async results are exposed to screen readers (alerts/status regions)', async ({ browser, baseURL }) => {
    const c = await newCustomer(browser, baseURL);
    const show = await freshShow(browser, baseURL);
    const b = (await (await reserveApi(c, show.id, ['B1'])).json()).data;
    await c.page.goto(`/bookings/${b.id}/checkout`);
    await expect(c.page.getByText(/Demonstration checkout/)).toBeVisible();
    await expect(c.page.getByRole('status').filter({ hasText: /Seats held for/ })).toHaveCount(0); // a ticking countdown must not be a live region
    await c.page.getByRole('button', { name: /Pay .* \(simulated\)/ }).click();
    await expect(c.page.getByRole('status').filter({ hasText: /Payment successful/ })).toBeVisible();
    await c.context.close();
  });
});
