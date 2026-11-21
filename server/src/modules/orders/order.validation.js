/**
 * src/modules/orders/order.validation.js – input rules for the order routes.
 *
 * Run by middleware/validate.middleware.js before the controller (see order.routes.js).
 * NOTICE WHAT IS MISSING: there are no rules for prices, totals, items or the user.
 * The client never sends them. The server reads the cart, the products and the coupon
 * from the database and calculates every rupee itself ("never trust the client").
 */
import { body, query } from 'express-validator';
import { ORDER_STATUS, PAYMENT_METHODS, PAYMENT_STATUS } from '../../config/constants.js';

// POST /api/orders – place an order from the current cart
export const placeOrderRules = [
  // Which of MY saved addresses to deliver to (ownership is checked in the service)
  body('addressId').isMongoId().withMessage('Please choose a shipping address'),
  // COD or CARD. Optional: the service uses COD when nothing is sent.
  body('paymentMethod')
    .optional()
    .isIn(Object.values(PAYMENT_METHODS))
    .withMessage('Invalid payment method'),
  // "" or null = no coupon. The coupon itself is checked again in the service.
  body('couponCode')
    .optional({ values: 'falsy' })
    .isString()
    .withMessage('Coupon code must be text')
    .bail()
    .trim()
    .isLength({ max: 20 })
    .withMessage('Coupon code must be at most 20 characters'),
  // A free-text note for the courier ("call before coming")
  body('note')
    .optional({ values: 'falsy' })
    .isString()
    .withMessage('Note must be text')
    .bail()
    .trim()
    .isLength({ max: 300 })
    .withMessage('Note must be at most 300 characters'),
];

// PATCH /api/orders/:id/cancel – the reason is optional
export const cancelRules = [
  body('reason')
    .optional({ values: 'falsy' })
    .isString()
    .withMessage('Reason must be text')
    .bail()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Reason must be at most 200 characters'),
];

// PATCH /api/admin/orders/:id/status – the admin moves an order along the state machine
export const statusRules = [
  // Must be a known status. WHETHER the move is allowed is the model's job (changeStatus).
  body('status').isIn(Object.values(ORDER_STATUS)).withMessage('Invalid status'),
  body('note')
    .optional({ values: 'falsy' })
    .isString()
    .withMessage('Note must be text')
    .bail()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Note must be at most 200 characters'),
  // Required for "shipped" (checked in the service, which knows the target status)
  body('trackingNumber')
    .optional({ values: 'falsy' })
    .isString()
    .withMessage('Tracking number must be text')
    .bail()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Tracking number must be at most 50 characters'),
];

// GET /api/orders/my and GET /api/admin/orders – optional filters. Unknown values are
// refused with 400 instead of being silently ignored, so typos are noticed early.
// Empty values (e.g. `?status=` from an "All" dropdown) simply mean "no filter".
export const listRules = [
  query('status')
    .optional({ values: 'falsy' })
    .isIn(Object.values(ORDER_STATUS))
    .withMessage('Invalid status filter'),
  query('paymentStatus')
    .optional({ values: 'falsy' })
    .isIn(Object.values(PAYMENT_STATUS))
    .withMessage('Invalid payment status filter'),
  query('from')
    .optional({ values: 'falsy' })
    .isISO8601()
    .withMessage('from must be a date (YYYY-MM-DD)'),
  query('to')
    .optional({ values: 'falsy' })
    .isISO8601()
    .withMessage('to must be a date (YYYY-MM-DD)'),
  query('search')
    .optional({ values: 'falsy' })
    .isString()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Search must be at most 50 characters'),
];
