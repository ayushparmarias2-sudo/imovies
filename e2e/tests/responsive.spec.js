const { test, expect } = require('@playwright/test');
const fs = require('fs');
const { newCustomer, newAdmin, freshShow, seatButton } = require('./helpers');

const VIEWPORTS = [['mobile-360', 360, 800], ['mobile-390', 390, 844], ['tablet-768', 768, 1024], ['desktop-1366', 1366, 768], ['desktop-1440', 1440, 900]];
const SHOTS = process.env.E2E_SHOTS_DIR; // optional: save screenshots for manual review
fs.mkdirSync(SHOTS || '.', { recursive: true });

const overflow = (page) => page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth }));
async function assertNoOverflow(page, label) {
  const o = await overflow(page);
  expect(o.doc, `horizontal overflow on ${label}: scrollWidth ${o.doc} > viewport ${o.win}`).toBeLessThanOrEqual(o.win);
}
async function shot(page, name) { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false }); }

for (const [name, width, height] of VIEWPORTS) {
  test.describe(`viewport ${name} (${width}×${height})`, () => {
    test('customer pages fit the viewport, navigation and seat map are usable', async ({ browser, baseURL }) => {
      const c = await newCustomer(browser, baseURL, { width, height });
      const { page } = c;
      const show = await freshShow(browser, baseURL);
      await page.goto('/'); await expect(page.locator('.movie-card').first()).toBeVisible();
      await assertNoOverflow(page, 'home'); await shot(page, `${name}-home`);
      const cols = await page.locator('.movie-card').evaluateAll((els) => new Set(els.map((e) => Math.round(e.getBoundingClientRect().left))).size);
      expect(cols).toBeGreaterThanOrEqual(width < 576 ? 2 : 3);

      if (width < 768) {
        await expect(page.getByRole('button', { name: 'Toggle navigation' })).toBeVisible();
        await expect(page.getByRole('link', { name: 'My bookings' })).toBeHidden();
        await page.getByRole('button', { name: 'Toggle navigation' }).click();
        await expect(page.getByRole('link', { name: 'My bookings' })).toBeVisible();
        await shot(page, `${name}-nav-open`);
      } else {
        await expect(page.getByRole('link', { name: 'My bookings' })).toBeVisible();
      }

      await page.locator('.movie-card').first().click();
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await assertNoOverflow(page, 'movie details'); await shot(page, `${name}-movie`);

      await page.goto(`/shows/${show.id}/seats`); await expect(seatButton(page, 'A1')).toBeVisible();
      await assertNoOverflow(page, 'seat selection'); await shot(page, `${name}-seats`);
      const box = await seatButton(page, 'A1').boundingBox();
      expect(box.width, 'seat target width (WCAG 2.5.8 min 24px)').toBeGreaterThanOrEqual(24);
      expect(box.height).toBeGreaterThanOrEqual(24);
      const gaps = await page.locator('.seat-row').first().locator('button.seat').evaluateAll((els) => els.slice(0, 5).map((e, i, a) => (i ? e.getBoundingClientRect().left - a[i - 1].getBoundingClientRect().right : 99)));
      gaps.slice(1).forEach((g) => expect(g).toBeGreaterThanOrEqual(2)); // no accidental neighbouring taps
      // the seat grid scrolls inside its own container instead of the page
      const scroller = await page.locator('.seat-scroll').evaluate((e) => ({ sw: e.scrollWidth, cw: e.clientWidth, ox: getComputedStyle(e).overflowX }));
      expect(['auto', 'scroll']).toContain(scroller.ox);
      await seatButton(page, 'A1').click(); await seatButton(page, 'A2').click();
      await expect(page.getByRole('button', { name: /Reserve 2 seats/ })).toBeVisible();
      await assertNoOverflow(page, 'seat selection with summary');
      await page.getByRole('button', { name: /Reserve 2 seats/ }).click();
      await expect(page.getByText('PENDING')).toBeVisible();
      await assertNoOverflow(page, 'booking pending'); await shot(page, `${name}-booking`);
      await page.getByRole('link', { name: 'Proceed to payment' }).click();
      await expect(page.getByText(/Demonstration checkout/)).toBeVisible();
      await assertNoOverflow(page, 'checkout'); await shot(page, `${name}-checkout`);
      await page.getByRole('button', { name: /Pay .* \(simulated\)/ }).click();
      await expect(page.getByText(/Payment successful/)).toBeVisible();
      await assertNoOverflow(page, 'booking confirmed');
      for (const p of ['/bookings', '/notifications', '/login', '/register']) { await page.goto(p); await page.waitForLoadState('networkidle'); await assertNoOverflow(page, p); }
      await c.context.close();
    });

    test('admin pages fit the viewport (tables scroll inside their container)', async ({ browser, baseURL }) => {
      const context = await browser.newContext({ baseURL, viewport: { width, height } });
      const admin = await newAdmin(browser, baseURL); // cookie holder
      await context.addCookies(await admin.context.cookies());
      const page = await context.newPage();
      await page.goto('/admin'); await expect(page.getByText('Active movies')).toBeVisible();
      await assertNoOverflow(page, 'admin dashboard'); await shot(page, `${name}-admin-dash`);
      for (const tab of ['Movies', 'Theaters', 'Shows', 'Bookings']) {
        await page.getByRole('tab', { name: tab }).click();
        await expect(page.getByRole('heading', { level: 2 })).toBeVisible();
        await assertNoOverflow(page, `admin ${tab}`);
      }
      await page.getByRole('tab', { name: 'Theaters' }).click();
      await page.getByRole('button', { name: '+ Add theater' }).click();
      await assertNoOverflow(page, 'admin theater form'); await shot(page, `${name}-admin-form`);
      await page.getByRole('tab', { name: 'Bookings' }).click();
      await assertNoOverflow(page, 'admin bookings'); await shot(page, `${name}-admin-bookings`);
      await Promise.all([context.close(), admin.context.close()]);
    });
  });
}
