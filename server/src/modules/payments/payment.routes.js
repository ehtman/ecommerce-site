/**
 * src/modules/payments/payment.routes.js – the URL map of the payments module.
 * Mounted in app.js under /api/payments.
 *
 *   POST /checkout-session  customer (verified email) → Stripe payment page URL
 *   GET  /expire-unpaid     scheduler only (cron secret) → cancel stale unpaid card orders
 *   POST /expire-unpaid     same, for schedulers that prefer POST
 *
 * The WEBHOOK (POST /api/payments/webhook) is NOT here: it is registered directly in
 * app.js, BEFORE express.json(), because it needs the raw, unparsed body to check
 * Stripe's signature. Routes in this file run after express.json() has already parsed it.
 */
import { Router } from 'express';
import { protect, authorize, requireVerifiedEmail } from '../../middleware/auth.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import { ROLES } from '../../config/constants.js';
import * as c from './payment.controller.js';
import { checkoutSessionRules } from './payment.validation.js';
import { requireCronSecret } from './cron.middleware.js';

const router = Router();

// Paying is a customer action. Admins get 403; unverified customers get 403 too (BR-12).
router.post(
  '/checkout-session',
  protect,
  authorize(ROLES.CUSTOMER),
  requireVerifiedEmail,
  validate(checkoutSessionRules),
  c.createCheckoutSession,
);

// No user token here: the caller is a machine. The cron secret is its "password".
router.get('/expire-unpaid', requireCronSecret, c.expireUnpaid); // Vercel Cron uses GET
router.post('/expire-unpaid', requireCronSecret, c.expireUnpaid);

export default router;
