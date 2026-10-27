const mongoose = require('mongoose');
const json = require('../utils/json');

const GENRES = ['Action', 'Adventure', 'Animation', 'Comedy', 'Crime', 'Documentary', 'Drama', 'Family',
  'Fantasy', 'Horror', 'Mystery', 'Romance', 'Sci-Fi', 'Thriller'];

const movieSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 150 },
    description: { type: String, required: true, trim: true, maxlength: 2000 },
    genres: {
      type: [{ type: String, enum: GENRES }],
      validate: [(a) => a.length >= 1, 'At least one genre is required'],
    },
    durationMinutes: { type: Number, required: true, min: 30, max: 300 },
    language: { type: String, required: true, trim: true, maxlength: 40 },
    certificate: { type: String, enum: ['U', 'UA', 'A', 'S'], default: 'UA' },
    releaseDate: { type: Date, required: true },
    posterUrl: { type: String, trim: true, default: '' },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);
movieSchema.index({ releaseDate: -1 });
movieSchema.index({ genres: 1 });
json(movieSchema);

const Movie = mongoose.model('Movie', movieSchema);
Movie.GENRES = GENRES;
module.exports = Movie;
