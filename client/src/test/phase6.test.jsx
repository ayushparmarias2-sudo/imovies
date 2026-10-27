import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, expect, test, vi } from 'vitest';
import { AuthProvider } from '../AuthContext.jsx';
import Navbar from '../components/Navbar.jsx';
import Notifications from '../pages/Notifications.jsx';

const json = (body) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
afterEach(() => vi.restoreAllMocks());

test('regression: navbar unread badge clears right after "Mark all read" (no navigation needed)', async () => {
  let unread = 2;
  vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
    if (url.endsWith('/auth/me')) return json({ success: true, data: { user: { name: 'Asha Verma', role: 'CUSTOMER' } } });
    if (url.endsWith('/notifications/read-all')) { unread = 0; return json({ success: true, data: { updated: 2 } }); }
    if (url.includes('/notifications')) return json({ success: true, data: unread ? [{ id: 'n1', title: 'Booking confirmed', message: 'ok', createdAt: new Date().toISOString() }] : [], meta: { unread } });
    return json({ success: false });
  });
  render(<MemoryRouter initialEntries={['/notifications']}><AuthProvider><Navbar /><Routes><Route path="/notifications" element={<Notifications />} /></Routes></AuthProvider></MemoryRouter>);
  expect(await screen.findByLabelText('2 unread')).toBeInTheDocument();
  await userEvent.click(await screen.findByRole('button', { name: /Mark all read/ }));
  await vi.waitFor(() => expect(screen.queryByLabelText(/unread/)).toBeNull());
});
