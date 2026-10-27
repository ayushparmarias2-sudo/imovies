import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { api, ApiError } from '../api.js';
import { AuthProvider } from '../AuthContext.jsx';
import ProtectedRoute from '../components/ProtectedRoute.jsx';
import Poster from '../components/Poster.jsx';
import SeatMap from '../components/SeatMap.jsx';
import SeatSelection from '../pages/SeatSelection.jsx';
import { errorText, money } from '../format.js';

vi.mock('../realtime.js', () => ({ watchShow: () => () => {} }));
const json = (status, body) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
afterEach(() => vi.restoreAllMocks());

describe('api client', () => {
  test('sends credentials and returns parsed body', async () => {
    const f = vi.spyOn(globalThis, 'fetch').mockReturnValue(json(200, { success: true, data: [1] }));
    const r = await api('/movies');
    expect(r.data).toEqual([1]);
    expect(f.mock.calls[0][0]).toBe('/api/movies');
    expect(f.mock.calls[0][1].credentials).toBe('include');
  });
  test('maps server errors and network failures to ApiError', async () => {
    vi.spyOn(globalThis, 'fetch').mockReturnValueOnce(json(409, { success: false, message: 'Taken', errors: { unavailableSeats: ['A1'] } }));
    await expect(api('/x')).rejects.toMatchObject({ status: 409, message: 'Taken', details: { unavailableSeats: ['A1'] } });
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('failed'));
    await expect(api('/x')).rejects.toBeInstanceOf(ApiError);
  });
  test('errorText joins validation messages; money formats rupees', () => {
    expect(errorText({ message: 'Validation failed', details: [{ message: 'A' }, { message: 'B' }] })).toBe('A • B');
    expect(money(1250)).toBe('₹1,250');
  });
});

const seats = [
  { label: 'A1', row: 'A', number: 1, category: 'STANDARD', price: 200, status: 'AVAILABLE', heldByYou: false },
  { label: 'A2', row: 'A', number: 2, category: 'STANDARD', price: 200, status: 'BOOKED', heldByYou: false },
  { label: 'A3', row: 'A', number: 3, category: 'STANDARD', price: 200, status: 'HELD', heldByYou: false },
  { label: 'B1', row: 'B', number: 1, category: 'PREMIUM', price: 350, status: 'AVAILABLE', heldByYou: false },
];

describe('SeatMap', () => {
  test('booked and held seats are disabled; available seats toggle with accessible labels', async () => {
    const onToggle = vi.fn();
    render(<SeatMap seats={seats} selected={new Set(['B1'])} onToggle={onToggle} />);
    expect(screen.getByRole('button', { name: /Seat A2.*booked/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Seat A3.*temporarily reserved/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Seat B1.*selected/ })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: /Seat A1.*₹200.*available/ }));
    expect(onToggle).toHaveBeenCalledWith(expect.objectContaining({ label: 'A1' }));
  });
});

describe('Poster', () => {
  test('falls back to a placeholder when the image fails or is missing', async () => {
    const { rerender } = render(<Poster title="Test Film" url="http://bad.example/x.jpg" />);
    fireEvent.error(screen.getByRole('img', { name: 'Test Film poster' }));
    expect(await screen.findByRole('img', { name: /placeholder/ })).toBeInTheDocument();
    rerender(<Poster title="Other" url="" />);
    expect(screen.getByRole('img', { name: /Other poster placeholder/ })).toBeInTheDocument();
  });
});

const routes = (el, initial) => render(
  <MemoryRouter initialEntries={[initial]}>
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<div>LOGIN PAGE</div>} />
        <Route path="/secret" element={<ProtectedRoute><div>SECRET</div></ProtectedRoute>} />
        <Route path="/shows/:id/seats" element={el} />
        <Route path="/bookings/:id" element={<div>BOOKING PAGE</div>} />
      </Routes>
    </AuthProvider>
  </MemoryRouter>
);

describe('ProtectedRoute', () => {
  test('redirects anonymous users to login; renders content for signed-in users', async () => {
    vi.spyOn(globalThis, 'fetch').mockReturnValue(json(401, { success: false, message: 'Authentication required' }));
    routes(null, '/secret');
    expect(await screen.findByText('LOGIN PAGE')).toBeInTheDocument();
  });
  test('shows content when the session is valid', async () => {
    vi.spyOn(globalThis, 'fetch').mockReturnValue(json(200, { success: true, data: { user: { name: 'Asha Verma', role: 'CUSTOMER' } } }));
    routes(null, '/secret');
    expect(await screen.findByText('SECRET')).toBeInTheDocument();
  });
});

describe('SeatSelection flow', () => {
  const show = { id: 's1', screenName: 'Screen 1', startsAt: new Date(Date.now() + 864e5).toISOString(), movie: { id: 'm1', title: 'Test Movie' }, theater: { name: 'T1' } };
  const mockApi = (reserveRes) => vi.spyOn(globalThis, 'fetch').mockImplementation((url, opts = {}) => {
    if (url.endsWith('/auth/me')) return json(200, { success: true, data: { user: { name: 'Asha', role: 'CUSTOMER' } } });
    if (url.endsWith('/shows/s1')) return json(200, { success: true, data: show });
    if (url.endsWith('/shows/s1/seats')) return json(200, { success: true, data: { summary: { AVAILABLE: 2, HELD: 1, BOOKED: 1 }, seats } });
    if (url.endsWith('/bookings/reserve')) return reserveRes(opts);
    return json(404, { success: false, message: 'nf' });
  });

  test('selects seats, shows server-independent total, reserves and navigates', async () => {
    let sent;
    mockApi((opts) => { sent = JSON.parse(opts.body); return json(201, { success: true, data: { id: 'b1' } }); });
    routes(<SeatSelection />, '/shows/s1/seats');
    await userEvent.click(await screen.findByRole('button', { name: /Seat A1/ }));
    await userEvent.click(screen.getByRole('button', { name: /Seat B1/ }));
    expect(screen.getAllByText('₹550').length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole('button', { name: /Reserve 2 seats/ }));
    expect(await screen.findByText('BOOKING PAGE')).toBeInTheDocument();
    expect(sent).toEqual({ showId: 's1', seats: expect.arrayContaining(['A1', 'B1']) }); // no client-side price sent
    expect(sent.totalAmount).toBeUndefined();
  });

  test('shows a clear conflict message when the server returns 409', async () => {
    mockApi(() => json(409, { success: false, message: 'Some of the selected seats are no longer available', errors: { unavailableSeats: ['A1'] } }));
    routes(<SeatSelection />, '/shows/s1/seats');
    await userEvent.click(await screen.findByRole('button', { name: /Seat A1/ }));
    await userEvent.click(screen.getByRole('button', { name: /Reserve 1 seat/ }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/no longer available: A1/));
  });
});
