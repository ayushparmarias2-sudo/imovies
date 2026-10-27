const http = require('http');
const { io: connect } = require('socket.io-client');
const app = require('../src/app');
const realtime = require('../src/realtime');
const h = require('./helpers');
const request = h.request;

let server, url, cat, alice;
beforeAll(async () => {
  await h.connectDb('realtime');
  server = http.createServer(app);
  realtime.init(server);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${server.address().port}`;
});
afterAll(async () => { await realtime.close(); await new Promise((r) => server.close(r)); await h.disconnectDb(); });
beforeEach(async () => { await h.resetDb(); cat = await h.createCatalog(); alice = await h.createUser(); });

const nextEvent = (socket) => new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('no seats:update received')), 5000);
  socket.once('seats:update', (p) => { clearTimeout(t); resolve(p); });
});

test('clients joined to a show get seats:update after reserve, pay and release; other shows stay quiet', async () => {
  const other = await h.createCatalog({ hoursAhead: 72 });
  const watcher = connect(url, { transports: ['websocket'] });
  const stranger = connect(url, { transports: ['websocket'] });
  await new Promise((r) => watcher.on('connect', r));
  await new Promise((r) => stranger.on('connect', r));
  watcher.emit('join', cat.show.id);
  stranger.emit('join', other.show.id);
  watcher.emit('join', 'not-an-id'); // ignored
  await new Promise((r) => setTimeout(r, 150));
  let strangerGot = false;
  stranger.on('seats:update', () => { strangerGot = true; });

  let ev = nextEvent(watcher);
  const reserved = await request(app).post('/api/bookings/reserve').set('Cookie', alice.cookie).send({ showId: cat.show.id, seats: ['A1'] });
  expect(await ev).toEqual({ showId: cat.show.id });

  ev = nextEvent(watcher);
  await request(app).post(`/api/bookings/${reserved.body.data.id}/pay`).set('Cookie', alice.cookie).send({ outcome: 'SUCCESS' });
  expect(await ev).toEqual({ showId: cat.show.id });

  ev = nextEvent(watcher);
  await request(app).post(`/api/bookings/${reserved.body.data.id}/cancel`).set('Cookie', alice.cookie);
  expect(await ev).toEqual({ showId: cat.show.id });
  expect(strangerGot).toBe(false);
  watcher.close(); stranger.close();
});
