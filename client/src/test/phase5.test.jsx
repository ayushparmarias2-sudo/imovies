import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { AuthProvider } from '../AuthContext.jsx';
import AdminRoute from '../components/AdminRoute.jsx';
import Checkout from '../pages/Checkout.jsx';
import BookingDetail from '../pages/BookingDetail.jsx';
import AdminBookings from '../pages/admin/AdminBookings.jsx';
import AdminMovies from '../pages/admin/AdminMovies.jsx';

const json = (status, body) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
afterEach(() => vi.restoreAllMocks());

const show = { id: 's1', screenName: 'Screen 1', startsAt: new Date(Date.now() + 864e5).toISOString(), movie: { title: 'Test Movie' }, theater: { name: 'T1' } };
const booking = (o = {}) => ({ id: 'b1', reference: 'IM-ABCDEFGHJK', status: 'PENDING', totalAmount: 550, expiresAt: new Date(Date.now() + 600000).toISOString(), show,
  seats: [{ label: 'A1', category: 'STANDARD', price: 200 }, { label: 'E1', category: 'PREMIUM', price: 350 }], payments: [], ...o });
const user = (role = 'CUSTOMER') => ({ success: true, data: { user: { name: 'Asha Verma', role } } });

/** routes fetch by URL suffix; handlers may be a body or a function(opts) */
const mockFetch = (map) => vi.spyOn(globalThis, 'fetch').mockImplementation((url, opts = {}) => {
  const key = Object.keys(map).find((k) => url.includes(k));
  if (!key) return json(404, { success: false, message: `no mock for ${url}` });
  const v = typeof map[key] === 'function' ? map[key](opts, url) : map[key];
  return v && typeof v.then === 'function' ? v : json(200, v);
});
const renderAt = (path, element, routePath) => render(
  <MemoryRouter initialEntries={[path]}><AuthProvider><Routes>
    <Route path={routePath} element={element} />
    <Route path="/bookings/:id" element={<div>BOOKING PAGE</div>} />
    <Route path="/login" element={<div>LOGIN PAGE</div>} />
  </Routes></AuthProvider></MemoryRouter>);

describe('Checkout', () => {
  test('is clearly labelled as a demo, has no card fields, and sends only the chosen outcome', async () => {
    let sent;
    mockFetch({ '/auth/me': user(), '/bookings/b1/pay': (o) => { sent = JSON.parse(o.body); return { success: true, data: { payment: { status: 'FAILED' } } }; }, '/bookings/b1': { success: true, data: booking() } });
    renderAt('/bookings/b1/checkout', <Checkout />, '/bookings/:id/checkout');
    expect(await screen.findByText(/Demonstration checkout/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/card number|cvv|expiry/i)).toBeNull();
    expect(screen.getAllByText('₹550').length).toBeGreaterThan(0);
    await userEvent.click(screen.getByLabelText(/Payment fails/));
    await userEvent.click(screen.getByRole('button', { name: /Pay ₹550 \(simulated\)/ }));
    expect(await screen.findByText('BOOKING PAGE')).toBeInTheDocument();
    expect(sent).toEqual({ outcome: 'FAILURE' });
  });
  test('redirects away if the booking is no longer pending', async () => {
    mockFetch({ '/auth/me': user(), '/bookings/b1': { success: true, data: booking({ status: 'CONFIRMED' }) } });
    renderAt('/bookings/b1/checkout', <Checkout />, '/bookings/:id/checkout');
    expect(await screen.findByText('BOOKING PAGE')).toBeInTheDocument();
  });
});

describe('BookingDetail states', () => {
  const page = (b) => { mockFetch({ '/auth/me': user(), '/bookings/b1/cancel': { success: true, data: {} }, '/bookings/b1': { success: true, data: b } }); renderAt('/bookings/b1', <BookingDetail />, '/bookings/:id'); };
  test('confirmed + cancellable: shows payment info, deadline and cancels after confirmation', async () => {
    const deadline = new Date(Date.now() + 36e5 * 20).toISOString();
    page(booking({ status: 'CONFIRMED', confirmedAt: new Date().toISOString(), payments: [{ id: 'p1', amount: 550, status: 'SUCCEEDED', transactionRef: 'SIM-1' }], cancellation: { allowed: true, deadline } }));
    expect(await screen.findByText(/Free cancellation until/)).toBeInTheDocument();
    expect(screen.getByText(/SIM-1/)).toBeInTheDocument();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel booking' }));
    await waitFor(() => expect(globalThis.fetch.mock.calls.some(([u, o]) => u.endsWith('/bookings/b1/cancel') && o.method === 'POST')).toBe(true));
  });
  test('confirmed but inside the cut-off: cancel is disabled and the reason is shown', async () => {
    page(booking({ status: 'CONFIRMED', cancellation: { allowed: false, reason: 'Cancellation closes 2 hours before the show' } }));
    expect(await screen.findByText(/closes 2 hours/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel booking' })).toBeDisabled();
  });
  test('failed payment shows a clear failure screen with a way to retry', async () => {
    page(booking({ status: 'FAILED', payments: [{ id: 'p1', amount: 550, status: 'FAILED', failureReason: 'Simulated payment was declined' }] }));
    expect(await screen.findByText(/Payment failed\./)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Choose seats again' })).toHaveAttribute('href', '/shows/s1/seats');
  });
  test('pending booking offers payment and release', async () => {
    page(booking());
    expect(await screen.findByRole('link', { name: 'Proceed to payment' })).toHaveAttribute('href', '/bookings/b1/checkout');
    expect(screen.getByRole('button', { name: 'Release seats' })).toBeInTheDocument();
  });
});

describe('admin', () => {
  test('AdminRoute blocks customers and lets admins in', async () => {
    mockFetch({ '/auth/me': user('CUSTOMER') });
    const { unmount } = renderAt('/admin', <AdminRoute><div>ADMIN AREA</div></AdminRoute>, '/admin');
    expect(await screen.findByText('Admins only')).toBeInTheDocument();
    expect(screen.queryByText('ADMIN AREA')).toBeNull();
    unmount(); vi.restoreAllMocks();
    mockFetch({ '/auth/me': user('ADMIN') });
    renderAt('/admin', <AdminRoute><div>ADMIN AREA</div></AdminRoute>, '/admin');
    expect(await screen.findByText('ADMIN AREA')).toBeInTheDocument();
  });
  test('AdminBookings confirms before cancelling and does nothing if declined', async () => {
    const b = { id: 'b1', reference: 'IM-1', status: 'CONFIRMED', totalAmount: 200, seats: [{ label: 'A1' }], user: { name: 'Asha', email: 'a@x.com' }, show: { startsAt: show.startsAt, movie: { title: 'Test Movie' }, theater: { name: 'T1' } } };
    mockFetch({ '/admin/bookings/b1/cancel': { success: true, data: {} }, '/admin/bookings': { success: true, data: [b], meta: { page: 1, pages: 1, total: 1 } } });
    render(<MemoryRouter><AdminBookings /></MemoryRouter>);
    const btn = await screen.findByRole('button', { name: 'Cancel' });
    const c = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await userEvent.click(btn);
    expect(globalThis.fetch.mock.calls.some(([u]) => u.includes('/cancel'))).toBe(false);
    c.mockReturnValue(true);
    await userEvent.click(btn);
    await waitFor(() => expect(globalThis.fetch.mock.calls.some(([u, o]) => u.includes('/admin/bookings/b1/cancel') && o.method === 'POST')).toBe(true));
  });
  test('AdminMovies shows the server message when a delete is refused (409)', async () => {
    const m = { id: 'm1', title: 'Busy Movie', genres: ['Action'], durationMinutes: 120, releaseDate: '2024-01-01T00:00:00.000Z', isActive: true };
    mockFetch({ '/movies/genres': { success: true, data: ['Action'] }, '/movies/m1': () => json(409, { success: false, message: 'This movie has shows and cannot be deleted. Set isActive=false instead.' }),
      '/movies?': { success: true, data: [m], meta: { page: 1, pages: 1, total: 1 } } });
    render(<MemoryRouter><AdminMovies /></MemoryRouter>);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await userEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    expect(await screen.findByText(/cannot be deleted/)).toBeInTheDocument();
  });
});
