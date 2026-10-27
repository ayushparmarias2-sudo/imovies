const { Notification, User } = require('../models');
const emailService = require('./emailService');

/** Creates an in-app notification and tries to email it. Never throws: a notification problem must not break a booking. */
async function notify({ userId, bookingId, type, title, message }) {
  try {
    const n = await Notification.create({ user: userId, booking: bookingId, type, title, message: message.slice(0, 500) });
    try {
      const user = await User.findById(userId).select('email');
      const r = await emailService.send({ to: user.email, subject: `iMovies: ${title}`, text: message });
      await Notification.updateOne({ _id: n._id }, { emailStatus: r.skipped ? 'SKIPPED' : 'SENT' });
    } catch (e) {
      console.error('[email] delivery failed:', e.message);
      await Notification.updateOne({ _id: n._id }, { emailStatus: 'FAILED' }).catch(() => {});
    }
    return n;
  } catch (e) {
    console.error('[notification] failed:', e.message);
    return null;
  }
}
module.exports = { notify };
