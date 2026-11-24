/**
 * src/modules/payments/payment.controller.js – HTTP layer for /api/payments.
 *
 * Layers: routes → CONTROLLER → service. Thin on purpose: read req, call ONE service
 * function, answer with sendSuccess. The customer is ALWAYS `req.user` (from the token).
 */
import asyncHandler from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/ApiResponse.js';
import * as paymentService from './payment.service.js';

// POST /api/payments/checkout-session → { url, sessionId }; the frontend redirects to url
export const createCheckoutSession = asyncHandler(async (req, res) => {
  const session = await paymentService.createCheckoutSession(req.user, req.body.orderId);
  sendSuccess(res, 200, 'Checkout session created', session);
});

// POST /api/payments/webhook (called by STRIPE, not by a browser).
// Mounted in app.js with express.raw() BEFORE express.json(), so req.body is the exact
// Buffer Stripe signed. Any 2xx answer tells Stripe "delivered, stop retrying".
export const stripeWebhook = asyncHandler(async (req, res) => {
  const result = await paymentService.handleWebhook(req.body, req.headers['stripe-signature']);
  sendSuccess(res, 200, 'Webhook received', { received: true, ...result });
});

// GET or POST /api/payments/expire-unpaid (called by the scheduler, after requireCronSecret)
export const expireUnpaid = asyncHandler(async (_req, res) => {
  const summary = await paymentService.expireUnpaidOrders();
  sendSuccess(res, 200, 'Expired unpaid card orders', summary);
});
