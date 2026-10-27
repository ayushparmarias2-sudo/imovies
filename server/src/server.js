const config = require('./config/env');
config.validate();
const http = require('http');
const app = require('./app');
const realtime = require('./realtime');
const { connectDb } = require('./config/db');
const { expireStaleReservations } = require('./services/bookingService');
const { getDummyHash } = require('./utils/password');

(async () => {
  await connectDb();
  await getDummyHash(); // warm the login-timing dummy hash so the first unknown-email login is not slower
  const server = http.createServer(app);
  realtime.init(server);
  server.listen(config.port, () => console.log(`iMovies API listening on :${config.port} (${config.env}) with Socket.IO`));
  const timer = setInterval(() => {
    expireStaleReservations().then((n) => n && console.log(`[cleanup] expired ${n} reservation(s)`)).catch((e) => console.error('[cleanup] failed:', e.message));
  }, config.booking.cleanupIntervalMs);
  timer.unref();
  const shutdown = () => { clearInterval(timer); server.close(() => process.exit(0)); };
  process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
})().catch((e) => { console.error('Startup failed:', e.message); process.exit(1); });
