/**
 * src/emails/templates.js – the content of every auth email.
 *
 * Each function returns { subject, html, text }:
 *   html = the pretty version, text = plain fallback for simple email apps.
 * Links point to the FRONTEND (React app), which then calls our API with the token.
 * Why not link straight to the API? Because the user should land on a friendly page.
 */
import env from '../config/env.js';

// Escape characters that mean something in HTML, so a name like "<script>" is shown as
// text instead of running as code (protects against HTML injection in emails).
export const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// Shared frame (logo + footer) so all emails look the same
function layout(title, body) {
  return `
  <div style="font-family:Arial,sans-serif;background:#f9fafb;padding:24px">
    <div style="max-width:560px;margin:auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:24px">
      <h2 style="color:#2563eb;margin-top:0">ShopEase</h2>
      <h3 style="color:#111827">${title}</h3>
      ${body}
      <p style="color:#6b7280;font-size:12px;margin-top:32px">You received this email because of activity on your ShopEase account.</p>
    </div>
  </div>`;
}

// A big clickable button plus the raw link (for email apps that block buttons)
function button(href, label) {
  return `<p><a href="${href}" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">${label}</a></p>
  <p style="color:#6b7280;font-size:12px">Or copy this link: ${href}</p>`;
}

// Sent after registration and on "resend verification"
export function verifyEmailTemplate(name, token) {
  const link = `${env.FRONTEND_URL}/verify-email?token=${token}`; // frontend page + token
  return {
    subject: 'Verify your ShopEase email',
    html: layout(
      `Hi ${escapeHtml(name)}, please verify your email`,
      `<p>Click the button below to verify your email. The link is valid for 24 hours.</p>${button(link, 'Verify email')}`,
    ),
    text: `Hi ${name}, verify your email: ${link}`,
  };
}

// Sent on "forgot password"
export function resetPasswordTemplate(name, token) {
  const link = `${env.FRONTEND_URL}/reset-password?token=${token}`;
  return {
    subject: 'Reset your ShopEase password',
    html: layout(
      `Hi ${escapeHtml(name)}, reset your password`,
      `<p>We received a request to reset your password. The link is valid for 30 minutes. If you did not ask for this, ignore this email.</p>${button(link, 'Reset password')}`,
    ),
    text: `Hi ${name}, reset your password: ${link}`,
  };
}

// Security notice after the password was changed or reset
export function passwordChangedTemplate(name) {
  return {
    subject: 'Your ShopEase password was changed',
    html: layout(
      `Hi ${escapeHtml(name)}`,
      '<p>Your password was changed. If this was not you, reset your password immediately.</p>',
    ),
    text: `Hi ${name}, your password was changed.`,
  };
}
