const nodemailer = require('nodemailer');

// Real email is sent only when SMTP settings are in .env (e.g. Gmail with an app password).
// Without them, emails are printed to the server log instead, so password resets still work locally.
const transporter = process.env.SMTP_HOST
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    })
  : null;

async function sendMail({ to, subject, text }) {
  if (!transporter) {
    if (process.env.NODE_ENV !== 'test') {
      console.log(`----- Email (not sent: SMTP is not set up in .env) -----\nTo: ${to}\nSubject: ${subject}\n\n${text}\n-----`);
    }
    return;
  }

  await transporter.sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to,
    subject,
    text,
  });
}

module.exports = { sendMail };
