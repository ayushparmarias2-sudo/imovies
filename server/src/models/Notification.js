const mongoose = require('mongoose');
const json = require('../utils/json');

const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking' },
    type: {
      type: String,
      enum: ['BOOKING_CONFIRMED', 'BOOKING_CANCELLED', 'PAYMENT_FAILED', 'SYSTEM'],
      required: true,
    },
    title: { type: String, required: true, maxlength: 120 },
    message: { type: String, required: true, maxlength: 500 },
    emailStatus: { type: String, enum: ['NOT_REQUESTED', 'SENT', 'SKIPPED', 'FAILED'], default: 'NOT_REQUESTED' },
    readAt: Date,
  },
  { timestamps: true }
);
notificationSchema.index({ user: 1, createdAt: -1 });
json(notificationSchema);

module.exports = mongoose.model('Notification', notificationSchema);
