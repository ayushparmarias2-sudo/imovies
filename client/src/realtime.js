import { io } from 'socket.io-client';

// Same origin in dev/preview (Vite proxies /socket.io); a separate API host when VITE_API_URL is set.
const origin = import.meta.env.VITE_API_URL ? new URL(import.meta.env.VITE_API_URL, window.location.href).origin : undefined;

/** Subscribes to seat changes for one show. Returns an unsubscribe function. onUpdate() should refetch the seat map. */
export function watchShow(showId, onUpdate) {
  const socket = io(origin, { transports: ['websocket', 'polling'], reconnectionDelayMax: 10000 });
  socket.on('connect', () => { socket.emit('join', showId); onUpdate(); }); // refetch on (re)connect to catch missed events
  socket.on('seats:update', (p) => { if (p?.showId === showId) onUpdate(); });
  return () => { socket.emit('leave', showId); socket.close(); };
}
