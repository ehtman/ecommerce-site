/**
 * src/emails/sendEmail.js – the one function that sends emails.
 *
 * - development: sends over SMTP to Mailpit (`docker compose up -d` → http://localhost:8025)
 * - production:  sends over your real SMTP provider (values from .env)
 * - test:        sends NOTHING; the email is pushed into the `outbox` array instead,
 *                so tests can read the verification/reset link like a user would.
 *
 * Email failures are logged, never thrown: a slow or broken mail server must not
 * make registration fail. (The user can always press "resend verification".)
 */
import nodemailer from 'nodemailer';
import env from '../config/env.js';

// In-memory "mailbox" used only by tests. Tests read it and empty it with clearOutbox().
export const outbox = [];
export const clearOutbox = () => outbox.splice(0, outbox.length); // empty the array in place

// ONE transporter (connection settings) for the whole app. Creating one is not free.
const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_PORT === 465, // port 465 uses TLS from the start; 587/1025 do not
  // Only send a username/password when one is configured (Mailpit needs none)
  auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
});

/**
 * @param {{to: string, subject: string, html: string, text: string}} message
 */
export default async function sendEmail({ to, subject, html, text }) {
  if (env.isTest) {
    // Tests: remember the email instead of sending it
    outbox.push({ to, subject, html, text });
    return;
  }
  try {
    await transporter.sendMail({ from: env.EMAIL_FROM, to, subject, html, text });
  } catch (err) {
    // Log and carry on (see the note at the top of the file)
    console.error(`📧 Email to ${to} failed: ${err.message}`);
  }
}
