const { test, expect } = require('@playwright/test');
const { newCustomer, freshShow, seatsOf, reserveApi, seatButton } = require('./helpers');

const settled = async (page) => { await expect(page.getByText(/^Hi, /)).toBeVisible(); await page.waitForLoadState('networkidle'); }; // login state + initial fetches done: later seat changes can only arrive via socket or poll

test.describe('concurrency, real time and recovery', () => {
  test('two browsers, same seat: exactly one reservation wins and the loser sees a clear conflict', async ({ browser, baseURL }) => {
    const a = await newCustomer(browser, baseURL);
    const b = await newCustomer(browser, baseURL);
    const show = await freshShow(browser, baseURL);
    // B's live updates are blocked so its seat map is stale: this exercises the server-side conflict path deterministically
    await b.context.route('**/socket.io/**', (r) => r.abort());
    await b.page.routeWebSocket(/socket\.io/, (ws) => ws.close());
    await Promise.all([a.page.goto(`/shows/${show.id}/seats`), b.page.goto(`/shows/${show.id}/seats`)]);
    await seatButton(a.page, 'C5').click();
    await seatButton(b.page, 'C5').click();
    await a.page.getByRole('button', { name: /Reserve 1 seat/ }).click();
    await expect(a.page.getByText('PENDING')).toBeVisible();
    await b.page.getByRole('button', { name: /Reserve 1 seat/ }).click();
    await expect(b.page.getByRole('alert')).toContainText(/no longer available: C5/);
    await expect(seatButton(b.page, 'C5')).toBeDisabled(); // map refreshed after the conflict
    expect((await seatsOf(a, show.id)).summary.HELD).toBe(1);
    await Promise.all([a.context.close(), b.context.close()]);
  });

  test('two browsers with live updates: the loser\'s selection is pruned with a notice (no stale click possible)', async ({ browser, baseURL }) => {
    const a = await newCustomer(browser, baseURL);
    const b = await newCustomer(browser, baseURL);
    const show = await freshShow(browser, baseURL);
    await Promise.all([a.page.goto(`/shows/${show.id}/seats`), b.page.goto(`/shows/${show.id}/seats`)]);
    await seatButton(b.page, 'D5').click();
    await expect(seatButton(b.page, 'D5')).toHaveAttribute('aria-pressed', 'true');
    await reserveApi(a, show.id, ['D5']);
    await expect(b.page.getByRole('status').filter({ hasText: /removed from your selection/ })).toBeVisible({ timeout: 5000 });
    await expect(seatButton(b.page, 'D5')).toBeDisabled();
    await Promise.all([a.context.close(), b.context.close()]);
  });

  test('truly simultaneous reservations of the same seats: one 201, the other 409, no partial holds', async ({ browser, baseURL }) => {
    const users = await Promise.all([newCustomer(browser, baseURL), newCustomer(browser, baseURL), newCustomer(browser, baseURL)]);
    const show = await freshShow(browser, baseURL);
    const sets = [['E1', 'E2', 'E3'], ['E3', 'E4'], ['E2', 'E5']];
    const results = await Promise.all(users.map((u, i) => reserveApi(u, show.id, sets[i])));
    const codes = results.map((r) => r.status());
    expect(codes.filter((c) => c === 201).length).toBeGreaterThanOrEqual(1);
    codes.forEach((c) => expect([201, 409]).toContain(c));
    const winners = (await Promise.all(results.map(async (r, i) => (r.status() === 201 ? sets[i] : []))))
    const held = winners.flat();
    expect(new Set(held).size).toBe(held.length);
    const map = await seatsOf(users[0], show.id);
    expect(map.seats.filter((s) => s.status === 'HELD').map((s) => s.label).sort()).toEqual([...held].sort());
    await Promise.all(users.map((u) => u.context.close()));
  });

  test('Socket.IO: another browser sees a seat get taken without reloading', async ({ browser, baseURL }) => {
    const a = await newCustomer(browser, baseURL);
    const watcher = await newCustomer(browser, baseURL);
    const show = await freshShow(browser, baseURL);
    await watcher.page.goto(`/shows/${show.id}/seats`);
    await expect(seatButton(watcher.page, 'B6')).toBeEnabled();
    await settled(watcher.page);
    await reserveApi(a, show.id, ['B6']);
    await expect(seatButton(watcher.page, 'B6')).toBeDisabled({ timeout: 5000 }); // far below the 15 s polling interval => pushed by the socket
    await a.context.close(); await watcher.context.close();
  });

  test('polling fallback: with sockets blocked the seat map still refreshes', async ({ browser, baseURL }) => {
    test.setTimeout(60_000);
    const a = await newCustomer(browser, baseURL);
    const watcher = await newCustomer(browser, baseURL);
    const show = await freshShow(browser, baseURL);
    await watcher.context.route('**/socket.io/**', (r) => r.abort());
    await watcher.page.routeWebSocket(/socket\.io/, (ws) => ws.close());
    await watcher.page.goto(`/shows/${show.id}/seats`);
    await expect(seatButton(watcher.page, 'B7')).toBeEnabled();
    await settled(watcher.page);
    await reserveApi(a, show.id, ['B7']);
    await watcher.page.waitForTimeout(4000);
    await expect(seatButton(watcher.page, 'B7')).toBeEnabled(); // no push is possible: still stale, proving the socket really is blocked
    await expect(seatButton(watcher.page, 'B7')).toBeDisabled({ timeout: 25_000 }); // ...and the 15 s poll then refreshes it
    await a.context.close(); await watcher.context.close();
  });

  test('simultaneous payments of one booking: exactly one succeeds; confirmed bookings cannot be paid again', async ({ browser, baseURL }) => {
    const c = await newCustomer(browser, baseURL);
    const show = await freshShow(browser, baseURL);
    const b = (await (await reserveApi(c, show.id, ['F1', 'F2'])).json()).data;
    const res = await Promise.all([1, 2, 3, 4].map(() => c.post(`/api/bookings/${b.id}/pay`, { outcome: 'SUCCESS' })));
    const codes = res.map((r) => r.status()).sort();
    expect(codes).toEqual([200, 409, 409, 409]);
    const detail = (await (await c.get(`/api/bookings/${b.id}`)).json()).data;
    expect(detail.status).toBe('CONFIRMED');
    expect(detail.payments.filter((p) => p.status === 'SUCCEEDED')).toHaveLength(1);
    expect(detail.payments.filter((p) => p.status === 'INITIATED')).toHaveLength(0);
    expect((await seatsOf(c, show.id)).summary.BOOKED).toBeGreaterThanOrEqual(2);
    expect((await c.post(`/api/bookings/${b.id}/pay`, { outcome: 'SUCCESS' })).status()).toBe(409);
    expect((await c.post(`/api/bookings/${b.id}/pay`, { outcome: 'FAILURE' })).status()).toBe(409);
    await c.page.goto(`/bookings/${b.id}/checkout`); // not pending any more => redirected to the booking page
    await expect(c.page).toHaveURL(new RegExp(`/bookings/${b.id}$`));
    await c.context.close();
  });

  test('cancelling updates availability for other watchers in real time and re-opens the seats', async ({ browser, baseURL }) => {
    const owner = await newCustomer(browser, baseURL);
    const watcher = await newCustomer(browser, baseURL);
    const show = await freshShow(browser, baseURL);
    const b = (await (await reserveApi(owner, show.id, ['A5'])).json()).data;
    await owner.post(`/api/bookings/${b.id}/pay`, { outcome: 'SUCCESS' });
    await watcher.page.goto(`/shows/${show.id}/seats`);
    await expect(seatButton(watcher.page, 'A5')).toBeDisabled();
    await expect(watcher.page.getByRole('button', { name: /^Seat A5, .*booked/ })).toBeVisible();
    expect((await owner.post(`/api/bookings/${b.id}/cancel`)).status()).toBe(200);
    await expect(seatButton(watcher.page, 'A5')).toBeEnabled({ timeout: 5000 });
    await owner.context.close(); await watcher.context.close();
  });
});
