/**
 * src/modules/payments/payment.validation.js – input rules for the payments routes.
 *
 * Only ONE value comes from the customer: which order to pay. The amount is NEVER
 * accepted from the client; the service reads the total from the order in the database.
 * The webhook has no rules here: its "validation" is Stripe's signature check.
 */
import { body } from 'express-validator';

export const checkoutSessionRules = [
  // Must look like a MongoDB id; the service then checks it exists AND belongs to the user
  body('orderId').isMongoId().withMessage('Invalid order'),
];
