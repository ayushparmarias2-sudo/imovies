const nodemailer = require('nodemailer');
const config = require('../config/env');

/**
 * Optional email. SMTP_URL unset -> skipped (the app works normally). SMTP_URL=json -> builds the message
 * without any network call (handy for local demos). Otherwise SMTP_URL is a nodemailer URL, e.g. smtps://user:pass@smtp.host:465
 */
async function send({ to, subject, text }) {
  const url = config.email.url;
  if (!url) return { skipped: true };
  const transport = url === 'json'
    ? nodemailer.createTransport({ jsonTransport: true })
    : nodemailer.createTransport(url, { connectionTimeout: 5000, greetingTimeout: 5000, socketTimeout: 8000 });
  await transport.sendMail({ from: config.email.from, to, subject, text });
  return { skipped: false };
}
module.exports = { send };
