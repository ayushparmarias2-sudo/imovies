/**
 * Poster artwork for the seeded demo movies. The images are original SVG files shipped with the client
 * (client/public/posters/<slug>.svg) and are referenced by a root-relative URL, so they load from the same origin as the
 * app with no third-party hotlinking. Admins can still use any http(s) image URL they have the rights to.
 */
const slugify = (title) => title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const posterFor = (title) => `/posters/${slugify(title)}.svg`;

/** Fills in a poster for seeded titles whose posterUrl is still empty. Never overwrites a poster someone already set. */
async function backfillSeedPosters(Movie, titles) {
  let updated = 0;
  for (const title of titles) {
    const r = await Movie.updateOne({ title, $or: [{ posterUrl: '' }, { posterUrl: { $exists: false } }] }, { $set: { posterUrl: posterFor(title) } });
    updated += r.modifiedCount;
  }
  return updated;
}

module.exports = { slugify, posterFor, backfillSeedPosters };
