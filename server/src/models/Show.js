const mongoose = require('mongoose');
const json = require('../utils/json');

const showSchema = new mongoose.Schema(
  {
    movie: { type: mongoose.Schema.Types.ObjectId, ref: 'Movie', required: true },
    theater: { type: mongoose.Schema.Types.ObjectId, ref: 'Theater', required: true },
    screenName: { type: String, required: true, trim: true },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    pricing: {
      standard: { type: Number, required: true, min: 0, validate: Number.isInteger },
      premium: { type: Number, required: true, min: 0, validate: Number.isInteger },
    },
    status: { type: String, enum: ['SCHEDULED', 'CANCELLED', 'COMPLETED'], default: 'SCHEDULED' },
  },
  { timestamps: true }
);
// No two shows may start at the same instant on the same screen (overlap is checked in the service).
showSchema.index({ theater: 1, screenName: 1, startsAt: 1 }, { unique: true });
showSchema.index({ movie: 1, startsAt: 1 });
showSchema.index({ startsAt: 1, status: 1 });
json(showSchema);

module.exports = mongoose.model('Show', showSchema);
