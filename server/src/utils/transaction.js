const mongoose = require('mongoose');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hasLabel = (e, label) => Boolean(e && typeof e.hasErrorLabel === 'function' && e.hasErrorLabel(label));

/**
 * Runs `fn(session)` in a transaction with a BOUNDED retry policy.
 *
 *  - TransientTransactionError (includes WriteConflict): the whole transaction is aborted and `fn` is re-run from
 *    scratch in a fresh snapshot, at most `maxAttempts` times with jittered backoff. `fn` must therefore be
 *    re-runnable (no side effects outside `session`). After the last attempt the error is thrown, never swallowed.
 *  - UnknownTransactionCommitResult: only the commit is retried (commit is idempotent), at most `maxCommitAttempts` times.
 *  - Any other error aborts the transaction and is rethrown unchanged. A failed transaction never reports success.
 *
 * Unlike session.withTransaction (which retries for up to 120 seconds), the number of attempts is explicit and small.
 */
async function runTransaction(fn, { maxAttempts = 5, maxCommitAttempts = 3, baseDelayMs = 10 } = {}) {
  const session = await mongoose.connection.startSession();
  try {
    for (let attempt = 1; ; attempt++) {
      session.startTransaction({ readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
      try {
        const result = await fn(session);
        for (let c = 1; ; c++) {
          try { await session.commitTransaction(); break; } catch (e) {
            if (hasLabel(e, 'UnknownTransactionCommitResult') && c < maxCommitAttempts) continue;
            throw e;
          }
        }
        return result;
      } catch (err) {
        if (session.inTransaction()) await session.abortTransaction().catch(() => {});
        if (hasLabel(err, 'TransientTransactionError') && attempt < maxAttempts) {
          await sleep(Math.random() * baseDelayMs * 2 ** attempt); // jitter: de-synchronise the contenders
          continue;
        }
        err.transactionAttempts = attempt;
        throw err;
      }
    }
  } finally {
    await session.endSession();
  }
}

module.exports = { runTransaction };
