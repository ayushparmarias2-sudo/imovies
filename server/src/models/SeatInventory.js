const mongoose = require('mongoose');

/**
 * One document per seat per show. This is the single source of truth for seat availability.
 * AVAILABLE -> HELD (pending reservation, has holdExpiresAt) -> BOOKED (after successful payment).
 */
const seatInventorySchema = new mongoose.Schema(
  {
    show: { type: mongoose.Schema.Types.ObjectId, ref: 'Show', required: true },
    label: { type: String, required: true, match: /^[A-Z]\d{1,2}$/ },
    row: { type: String, required: true },
    number: { type: Number, required: true },
    category: { type: String, enum: ['STANDARD', 'PREMIUM'], required: true },
    price: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ['AVAILABLE', 'HELD', 'BOOKED'], default: 'AVAILABLE' },
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking' },
    holdExpiresAt: { type: Date },
  },
  { timestamps: true }
);
// Database-level guarantee: a seat exists exactly once per show.
seatInventorySchema.index({ show: 1, label: 1 }, { unique: true });
seatInventorySchema.index({ booking: 1 });
seatInventorySchema.index({ show: 1, status: 1 });

module.exports = mongoose.model('SeatInventory', seatInventorySchema);
