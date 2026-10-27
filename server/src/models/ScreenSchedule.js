const mongoose = require('mongoose');

/**
 * One tiny "lock" document per physical screen (theater + screen name). Show creation increments `version`
 * inside its transaction BEFORE it checks for overlaps. Two transactions that both write the same document
 * cannot both commit from overlapping snapshots: MongoDB aborts the loser with a WriteConflict
 * (TransientTransactionError), and the retry then sees the winner's committed show. Different screens use
 * different documents, so they never contend. See README ("Show scheduling concurrency").
 */
const screenScheduleSchema = new mongoose.Schema(
  {
    theater: { type: mongoose.Schema.Types.ObjectId, ref: 'Theater', required: true },
    screenName: { type: String, required: true, trim: true },
    version: { type: Number, default: 0 },
  },
  { versionKey: false }
);
screenScheduleSchema.index({ theater: 1, screenName: 1 }, { unique: true });

module.exports = mongoose.model('ScreenSchedule', screenScheduleSchema);
