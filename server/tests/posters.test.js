const fs = require('fs');
const path = require('path');
const app = require('../src/app');
const h = require('./helpers');
const { createMovie } = require('../src/validators/catalog');
const { slugify, posterFor, backfillSeedPosters } = require('../src/seed/posters');

const request = h.request;
const { Movie } = h.models;
const POSTER_DIR = path.join(__dirname, '..', '..', 'client', 'public', 'posters');
const SEED_TITLES = [
  'Midnight Monsoon', 'Orbit Station Nine', 'The Last Chai Stall', 'Dragon Kite Festival',
  'Ghats of Varanasi', 'Iron Circuit', 'Whispers in the Haveli', 'Stardust Summer',
];
const base = { title: 'Poster Test', description: 'A film used to test poster URLs.', genres: ['Drama'], durationMinutes: 100, language: 'English', releaseDate: '2026-01-01' };
const parse = (posterUrl) => createMovie.body.safeParse({ ...base, posterUrl });

let admin;
beforeAll(async () => { await h.connectDb('posters'); admin = await h.createUser('ADMIN'); });
afterAll(() => h.disconnectDb());

describe('posterUrl validation', () => {
  test.each(['', 'https://img.example.com/p.jpg', 'http://img.example.com/p.png', '/posters/midnight-monsoon.svg', '/posters/a_b-c.1.WEBP'])('accepts %p', (u) => {
    expect(parse(u).success).toBe(true);
  });
  test.each([
    ['protocol-relative (open redirect style)', '//evil.example/p.jpg'],
    ['path traversal', '/posters/../secret.svg'],
    ['other directory', '/uploads/p.jpg'],
    ['javascript scheme', 'javascript:alert(1)'],
    ['data URL', 'data:image/svg+xml,<svg onload=alert(1)>'],
    ['query/fragment on local path', '/posters/x.svg?x=1'],
    ['non-image extension', '/posters/x.html'],
    ['ftp', 'ftp://x.example/p.jpg'],
    ['backslash', '/posters\\x.svg'],
  ])('rejects %s', (_n, u) => { expect(parse(u).success).toBe(false); });

  test('the admin API stores a local poster path and rejects a bad one', async () => {
    const ok = await request(app).post('/api/movies').set('Cookie', admin.cookie).send({ ...base, posterUrl: '/posters/iron-circuit.svg' });
    expect(ok.status).toBe(201);
    expect(ok.body.data.posterUrl).toBe('/posters/iron-circuit.svg');
    const bad = await request(app).post('/api/movies').set('Cookie', admin.cookie).send({ ...base, title: 'Bad Poster', posterUrl: '//evil.example/x.svg' });
    expect(bad.status).toBe(400);
  });
});

describe('seeded poster artwork', () => {
  test('slug mapping is stable', () => {
    expect(slugify('Whispers in the Haveli')).toBe('whispers-in-the-haveli');
    expect(posterFor('The Last Chai Stall')).toBe('/posters/the-last-chai-stall.svg');
  });
  test.each(SEED_TITLES)('%s has a real, well-formed, script-free poster file', (title) => {
    const file = path.join(POSTER_DIR, `${slugify(title)}.svg`);
    expect(fs.existsSync(file)).toBe(true);
    const svg = fs.readFileSync(file, 'utf8');
    expect(svg).toMatch(/^<svg [^>]*viewBox="0 0 400 600"/);
    expect(svg.length).toBeGreaterThan(1500);
    expect(svg).not.toMatch(/<script|onload=|href=|xlink:|<image|<foreignObject/i); // static art only, nothing fetched or executable
  });
  test('the seed script uses these titles and poster paths (no drift between seed and artwork)', () => {
    const seed = fs.readFileSync(path.join(__dirname, '..', 'src', 'seed', 'seed.js'), 'utf8');
    for (const t of SEED_TITLES) expect(seed).toContain(`'${t}'`);
    expect(seed).toContain('posterUrl: posterFor(title)');
  });
  test('only the seed titles are mapped: the artwork folder has exactly these files', () => {
    expect(fs.readdirSync(POSTER_DIR).sort()).toEqual(SEED_TITLES.map((t) => `${slugify(t)}.svg`).sort());
  });
});

describe('backfill for databases seeded before posters existed', () => {
  beforeEach(() => Movie.deleteMany({}));
  test('fills empty posters, never overwrites a custom one, and is idempotent', async () => {
    const mk = (title, posterUrl) => Movie.create({ ...base, title, releaseDate: new Date('2026-01-01'), posterUrl });
    await mk('Midnight Monsoon', '');
    await mk('Iron Circuit', 'https://cdn.example.com/custom-iron.jpg');
    await mk('Not A Seed Movie', '');
    expect(await backfillSeedPosters(Movie, SEED_TITLES)).toBe(1);
    expect((await Movie.findOne({ title: 'Midnight Monsoon' })).posterUrl).toBe('/posters/midnight-monsoon.svg');
    expect((await Movie.findOne({ title: 'Iron Circuit' })).posterUrl).toBe('https://cdn.example.com/custom-iron.jpg');
    expect((await Movie.findOne({ title: 'Not A Seed Movie' })).posterUrl).toBe('');
    expect(await backfillSeedPosters(Movie, SEED_TITLES)).toBe(0);
  });
});
