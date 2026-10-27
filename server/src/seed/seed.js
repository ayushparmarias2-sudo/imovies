/* Usage: npm run seed   |   npm run seed:reset (wipes catalogue + bookings, keeps users) */
const mongoose = require('mongoose');
const config = require('../config/env');
const { connectDb } = require('../config/db');
const { User, Movie, Theater, Show, ScreenSchedule, SeatInventory, Booking, Payment, Notification } = require('../models');
const { createShow } = require('../services/showService');
const ensureAdmin = require('./ensureAdmin');
const { posterFor, backfillSeedPosters } = require('./posters');
const { hashPassword } = require('../utils/password');

const day = 86400000;
const movies = [
  ['Midnight Monsoon', 'A retired detective returns to Mumbai during the monsoon to solve one last case.', ['Crime', 'Thriller'], 128, 'Hindi', 'UA', -20],
  ['Orbit Station Nine', 'A repair crew discovers that their space station is not as empty as it seems.', ['Sci-Fi', 'Thriller'], 142, 'English', 'UA', -12],
  ['The Last Chai Stall', 'A heartwarming comedy about a street vendor who takes on a billion-dollar café chain.', ['Comedy', 'Drama'], 118, 'Hindi', 'U', -30],
  ['Dragon Kite Festival', 'Two siblings embark on a magical journey to save their village festival.', ['Animation', 'Family', 'Adventure'], 96, 'English', 'U', -8],
  ['Ghats of Varanasi', 'A quiet romance blooms between a boatman and a visiting photographer.', ['Romance', 'Drama'], 135, 'Hindi', 'UA', -15],
  ['Iron Circuit', 'A street racer is pulled into a heist that spans three cities.', ['Action'], 152, 'Telugu', 'UA', -5],
  ['Whispers in the Haveli', 'A family returns to an ancestral mansion where something has been waiting.', ['Horror', 'Mystery'], 112, 'Hindi', 'A', -10],
  ['Stardust Summer', 'Four friends spend one last summer before college changes everything.', ['Comedy', 'Romance'], 124, 'English', 'UA', 12], // upcoming
].map(([title, description, genres, durationMinutes, language, certificate, offset]) => ({
  title, description, genres, durationMinutes, language, certificate,
  releaseDate: new Date(Date.now() + offset * day), posterUrl: posterFor(title),
}));

const screens = [
  { name: 'Screen 1', rows: 8, seatsPerRow: 12, premiumRows: 2 },
  { name: 'Screen 2', rows: 6, seatsPerRow: 10, premiumRows: 1 },
];
const theaters = [
  { name: 'iMovies Central', city: 'Indore', address: 'MG Road, Indore, Madhya Pradesh', screens },
  { name: 'iMovies Treasure Island', city: 'Indore', address: 'Treasure Island Mall, Indore', screens },
  { name: 'iMovies Vijay Nagar', city: 'Indore', address: 'Vijay Nagar Square, Indore', screens },
];

/** Cinema-local time (TZ_OFFSET_MINUTES) on day +d at hh:mm -> UTC Date. */
function localSlot(d, hh, mm) {
  const local = new Date(Date.now() + config.tzOffsetMinutes * 60000);
  const base = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + d);
  return new Date(base - config.tzOffsetMinutes * 60000 + (hh * 60 + mm) * 60000);
}

(async () => {
  if (process.argv.includes('--reset') && config.isProd && !process.argv.includes('--yes-wipe-production')) {
    throw new Error('Refusing to wipe catalogue and bookings while NODE_ENV=production (add --yes-wipe-production if you really mean it).');
  }
  config.validate();
  await connectDb();
  if (process.argv.includes('--reset')) {
    await Promise.all([Movie, Theater, Show, ScreenSchedule, SeatInventory, Booking, Payment, Notification].map((m) => m.deleteMany({})));
    console.log('Catalogue and bookings reset.');
  }
  const admin = await ensureAdmin();
  console.log(admin.skipped ? 'Admin: skipped (set ADMIN_EMAIL / ADMIN_PASSWORD)' : `Admin ${admin.created ? 'created' : 'already present (left unchanged)'}: ${admin.email}`);

  if (process.env.SEED_CUSTOMER_EMAIL && process.env.SEED_CUSTOMER_PASSWORD && !config.isProd) {
    const email = process.env.SEED_CUSTOMER_EMAIL.trim().toLowerCase();
    if (!(await User.exists({ email }))) {
      await User.create({ name: 'Demo Customer', email, passwordHash: await hashPassword(process.env.SEED_CUSTOMER_PASSWORD) });
      console.log(`Demo customer created: ${email}`);
    }
  }

  if (await Movie.estimatedDocumentCount()) {
    console.log('Catalogue already present - skipping (use seed:reset to rebuild).');
    const filled = await backfillSeedPosters(Movie, movies.map((m) => m.title)); // older databases were seeded without posters
    if (filled) console.log(`Added posters to ${filled} seeded movie(s) that had none.`);
  } else {
    const createdMovies = await Movie.insertMany(movies);
    const createdTheaters = await Theater.insertMany(theaters);
    const showing = createdMovies.filter((m) => m.releaseDate <= new Date());
    const times = [[10, 30], [14, 30], [19, 0]];
    let n = 0;
    for (let d = 1; d <= 5; d++) {
      for (const [ti, t] of createdTheaters.entries()) {
        for (const [si, s] of t.screens.entries()) {
          for (const [slot, [hh, mm]] of times.entries()) {
            const movie = showing[(d + ti * 2 + si + slot) % showing.length];
            await createShow({
              movieId: movie._id, theaterId: t._id, screenName: s.name, startsAt: localSlot(d, hh, mm),
              pricing: { standard: 180 + si * 20, premium: 320 + si * 30 },
            });
            n++;
          }
        }
      }
    }
    console.log(`Seeded ${createdMovies.length} movies, ${createdTheaters.length} theaters, ${n} shows (+ seat inventory).`);
  }
  await mongoose.disconnect();
})().catch(async (e) => {
  console.error('Seed failed:', e.message); // fails closed: e.g. an existing non-admin account owns ADMIN_EMAIL
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
