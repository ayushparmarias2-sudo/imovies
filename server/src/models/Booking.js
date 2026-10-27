const mongoose = require('mongoose');
const json = require('../utils/json');

const bookedSeatSchema = new mongoose.Schema(
  {
    label: { type: String, required: true },
    category: { type: String, enum: ['STANDARD', 'PREMIUM'], required: true },
    price: { type: Number, required: true, min: 0 }, // snapshot taken from SeatInventory on the server
  },
  { _id: false }
);

const bookingSchema = new mongoose.Schema(
  {
    reference: { type: String, required: true, unique: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    show: { type: mongoose.Schema.Types.ObjectId, ref: 'Show', required: true },
    seats: { type: [bookedSeatSchema], validate: [(a) => a.length > 0, 'At least one seat is required'] },
    totalAmount: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: ['PENDING', 'CONFIRMED', 'CANCELLED', 'EXPIRED', 'FAILED'],
      default: 'PENDING',
    },
    expiresAt: { type: Date }, // reservation hold expiry (PENDING only)
    confirmedAt: Date,
    cancelledAt: Date,
  },
  { timestamps: true }
);
bookingSchema.index({ user: 1, createdAt: -1 });
bookingSchema.index({ status: 1, expiresAt: 1 });
bookingSchema.index({ show: 1, user: 1, status: 1 });
json(bookingSchema);

module.exports = mongoose.model('Booking', bookingSchema);
