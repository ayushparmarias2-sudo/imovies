const mongoose = require('mongoose');
const json = require('../utils/json');

// Simulated payments only. No card data is ever collected or stored.
const paymentSchema = new mongoose.Schema(
  {
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true, min: 0 },
    method: { type: String, enum: ['SIMULATED'], default: 'SIMULATED' },
    status: { type: String, enum: ['INITIATED', 'SUCCEEDED', 'FAILED', 'REFUNDED'], default: 'INITIATED' },
    failureReason: String,
    refundedAt: Date,
    transactionRef: { type: String, unique: true, sparse: true },
  },
  { timestamps: true }
);
paymentSchema.index({ booking: 1, createdAt: -1 });
json(paymentSchema);

module.exports = mongoose.model('Payment', paymentSchema);
