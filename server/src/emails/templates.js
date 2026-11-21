/**
 * src/emails/templates.js – the content of every email (auth, and orders from branch 07).
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

/* ---------- Orders (branch 07) ---------- */

// Money as customers read it: 12500 → "Rs 12,500" (all amounts are whole rupees)
const rs = (n) => `Rs ${Number(n).toLocaleString('en-PK')}`;

// Where the customer can see the order in the React app
const orderLink = (order) => `${env.FRONTEND_URL}/account/orders/${order._id}`;

// The receipt table: one row per item, then the money breakdown.
// Product names come from the database, but an admin typed them, so we still escape them.
function itemsTable(order) {
  const rows = order.items
    .map(
      (i) =>
        `<tr><td style="padding:6px 0">${escapeHtml(i.name)} × ${i.quantity}</td><td style="text-align:right">${rs(i.subtotal)}</td></tr>`,
    )
    .join('');
  return `<table style="width:100%;border-collapse:collapse;font-size:14px">
    ${rows}
    <tr><td style="padding-top:12px">Items</td><td style="text-align:right;padding-top:12px">${rs(order.itemsPrice)}</td></tr>
    ${order.discountPrice ? `<tr><td>Discount</td><td style="text-align:right">- ${rs(order.discountPrice)}</td></tr>` : ''}
    <tr><td>Shipping</td><td style="text-align:right">${order.shippingPrice ? rs(order.shippingPrice) : 'Free'}</td></tr>
    <tr><td><b>Total</b></td><td style="text-align:right"><b>${rs(order.totalPrice)}</b></td></tr>
  </table>`;
}

// Sent right after a COD order is placed (branch 08: after Stripe confirms a CARD payment)
export function orderConfirmationTemplate(name, order) {
  const link = orderLink(order);
  const a = order.shippingAddress; // the SNAPSHOT stored in the order, not the live address
  // Every customer-typed value is escaped (name, address lines…)
  const shipTo = [
    `${escapeHtml(a.fullName)}, ${escapeHtml(a.phone)}`,
    `${escapeHtml(a.addressLine1)}${a.addressLine2 ? `, ${escapeHtml(a.addressLine2)}` : ''}`,
    `${escapeHtml(a.city)}, ${escapeHtml(a.province)} ${escapeHtml(a.postalCode)}`,
  ].join('<br/>');
  return {
    subject: `Order ${order.orderNumber} confirmed`,
    html: layout(
      `Thank you for your order, ${escapeHtml(name)}!`,
      `<p>Order number: <b>${order.orderNumber}</b><br/>Payment: ${order.paymentMethod === 'COD' ? 'Cash on Delivery' : 'Card'}</p>
      ${itemsTable(order)}
      <p style="margin-top:16px"><b>Ship to:</b><br/>${shipTo}</p>
      ${button(link, 'View order')}`,
    ),
    text: `Order ${order.orderNumber} placed. Total ${rs(order.totalPrice)}. ${link}`,
  };
}

// The sentence used for each status ("Your order ORD-… has been shipped")
const STATUS_TEXT = {
  confirmed: 'has been confirmed',
  processing: 'is being prepared',
  shipped: 'has been shipped',
  delivered: 'has been delivered',
  cancelled: 'has been cancelled',
};

// Sent when the status changes (confirmed, shipped, delivered, cancelled)
export function orderStatusTemplate(name, order) {
  const link = orderLink(order);
  const sentence = STATUS_TEXT[order.status] || 'was updated';
  // Extra lines only when they make sense for this status
  const extra =
    order.status === 'shipped' && order.trackingNumber
      ? `<p>Tracking number: <b>${escapeHtml(order.trackingNumber)}</b></p>`
      : '';
  const reason =
    order.status === 'cancelled' && order.cancelReason
      ? `<p>Reason: ${escapeHtml(order.cancelReason)}</p>`
      : '';
  return {
    subject: `Order ${order.orderNumber} ${sentence}`,
    html: layout(
      `Hi ${escapeHtml(name)}`,
      `<p>Your order <b>${order.orderNumber}</b> ${sentence}.</p>${extra}${reason}${button(link, 'View order')}`,
    ),
    text: `Your order ${order.orderNumber} ${sentence}. ${link}`,
  };
}
