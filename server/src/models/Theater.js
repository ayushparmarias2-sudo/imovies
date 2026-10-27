const mongoose = require('mongoose');
const json = require('../utils/json');

const screenSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 40 },
    rows: { type: Number, required: true, min: 1, max: 26, validate: Number.isInteger },
    seatsPerRow: { type: Number, required: true, min: 1, max: 30, validate: Number.isInteger },
    premiumRows: { type: Number, default: 0, min: 0, validate: Number.isInteger },
  },
  { _id: false }
);

const theaterSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    city: { type: String, required: true, trim: true, maxlength: 80 },
    address: { type: String, required: true, trim: true, maxlength: 250 },
    screens: {
      type: [screenSchema],
      validate: [
        { validator: (s) => s.length >= 1, message: 'A theater needs at least one screen' },
        {
          validator: (s) => new Set(s.map((x) => x.name)).size === s.length,
          message: 'Screen names must be unique within a theater',
        },
        { validator: (s) => s.every((x) => x.premiumRows <= x.rows), message: 'premiumRows cannot exceed rows' },
      ],
    },
  },
  { timestamps: true }
);
theaterSchema.index({ city: 1, name: 1 }, { unique: true });
json(theaterSchema);

module.exports = mongoose.model('Theater', theaterSchema);
