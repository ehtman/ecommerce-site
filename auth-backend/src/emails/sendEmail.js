import nodemailer from 'nodemailer';
import env from '../config/env.js';

// One transporter for the whole app. In development it points to Mailpit (port 1025).
const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_PORT === 465,
  auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
});

// Sends an email. Failures are logged, never thrown — an email problem must not break the API.
export default async function sendEmail({ to, subject, html, text }) {
  try {
    await transporter.sendMail({ from: env.EMAIL_FROM, to, subject, html, text });
  } catch (err) {
    console.error(`📧 Email to ${to} failed: ${err.message}`);
  }
}
