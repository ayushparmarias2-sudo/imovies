const { z, idParam, objectId, page, limit, nonEmpty } = require('./common');
const { Movie } = require('../models');

const LOCAL_POSTER = /^\/posters\/[A-Za-z0-9][A-Za-z0-9._-]{0,100}\.(svg|png|jpe?g|webp|avif)$/i;

const movieFields = z.object({
  title: z.string().trim().min(1).max(150),
  description: z.string().trim().min(10).max(2000),
  genres: z.array(z.enum(Movie.GENRES)).min(1),
  durationMinutes: z.number().int().min(30).max(300),
  language: z.string().trim().min(2).max(40),
  certificate: z.enum(['U', 'UA', 'A', 'S']).default('UA'),
  releaseDate: z.coerce.date(),
  // Empty, an http(s) image URL, or a poster file shipped with the client (/posters/<name>.<ext>). No other schemes or paths.
  posterUrl: z.union([
    z.literal(''),
    z.string().trim().regex(LOCAL_POSTER, 'Must be an http(s) URL or a /posters/<file> path'),
    z.string().trim().url().max(500).refine((u) => /^https?:\/\//i.test(u), 'Must be an http(s) URL or a /posters/<file> path'),
  ]).default(''),
  isActive: z.boolean().default(true),
});
const screen = z.object({
  name: z.string().trim().min(1).max(40),
  rows: z.number().int().min(1).max(26),
  seatsPerRow: z.number().int().min(1).max(30),
  premiumRows: z.number().int().min(0).default(0),
});
const theaterFields = z.object({
  name: z.string().trim().min(2).max(100),
  city: z.string().trim().min(2).max(80),
  address: z.string().trim().min(5).max(250),
  screens: z.array(screen).min(1).max(12),
});
const money = z.number().int().min(0).max(10000);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

exports.listMovies = {
  query: z.object({
    search: z.string().trim().max(100).optional(),
    genre: z.enum(Movie.GENRES).optional(),
    status: z.enum(['nowShowing', 'upcoming', 'all']).default('all'),
    availability: z.enum(['withShows']).optional(),
    includeInactive: z.enum(['true', 'false']).default('false'),
    page, limit,
  }),
};
exports.createMovie = { body: movieFields };
exports.updateMovie = { params: idParam, body: nonEmpty(movieFields.partial()) };
exports.theaterCreate = { body: theaterFields };
exports.theaterUpdate = { params: idParam, body: nonEmpty(theaterFields.partial()) };
exports.listShows = {
  query: z.object({ movie: objectId.optional(), theater: objectId.optional(), date: date.optional(), page, limit: z.coerce.number().int().min(1).max(100).default(50) }),
};
exports.createShow = {
  body: z.object({
    movie: objectId, theater: objectId, screenName: z.string().trim().min(1),
    startsAt: z.coerce.date(), pricing: z.object({ standard: money, premium: money }),
  }),
};
exports.idParam = { params: idParam };
