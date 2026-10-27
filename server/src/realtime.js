const { Server } = require('socket.io');
const config = require('./config/env');

let io = null;
const ID = /^[a-f\d]{24}$/i;

/** Attaches Socket.IO to the HTTP server. Rooms are per show; payloads carry only the show id (clients refetch). */
function init(httpServer) {
  io = new Server(httpServer, { cors: { origin: config.clientOrigins, credentials: true } });
  io.on('connection', (socket) => {
    socket.on('join', (showId) => { if (typeof showId === 'string' && ID.test(showId)) socket.join(`show:${showId}`); });
    socket.on('leave', (showId) => { if (typeof showId === 'string') socket.leave(`show:${showId}`); });
  });
  return io;
}
/** No-op until init() has been called (e.g. in tests that do not need sockets). */
const seatsChanged = (showId) => { if (io) io.to(`show:${showId}`).emit('seats:update', { showId: String(showId) }); };
const close = () => new Promise((resolve) => { if (!io) return resolve(); const i = io; io = null; i.close(() => resolve()); });

module.exports = { init, seatsChanged, close };
