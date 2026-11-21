/**
 * src/modules/coupons/coupon.validation.js – input rules for the coupon routes.
 *
 * Two rule sets:
 *  - validateCouponRules → POST /api/coupons/validate  (customer types a code)
 *  - couponRules         → POST /api/coupons and PUT /api/coupons/:id (admin form, sent WHOLE)
 *
 * The model repeats the important rules (defence in depth), but checking here gives the admin
 * a clear message per field BEFORE anything touches the database.
 * Run by middleware/validate.middleware.js (see coupon.routes.js).
 */
import { body } from 'express-validator';
import { COUPON_TYPES, LIMITS, REGEX } from '../../config/constants.js';

const TYPES = Object.values(COUPON_TYPES); // ['percentage', 'fixed']

// POST /api/coupons/validate – only the code. We do NOT check the code's pattern here: an
// unknown or badly typed code simply answers 404 "Coupon not found", which is friendlier.
export const validateCouponRules = [
  body('code')
    .isString()
    .withMessage('Enter a coupon code')
    .bail() // stop here if it is not text (the next rules would crash on a number/object)
    .trim()
    .notEmpty()
    .withMessage('Enter a coupon code')
    .isLength({ max: 20 })
    .withMessage('Coupon code is too long'),
];

/**
 * Optional whole number ≥ min. `values: 'falsy'` means "", null, 0 and false count as
 * "not given", so an admin can clear an optional field (e.g. remove the max-discount cap).
 * toInt() turns "500" (a form string) into the number 500 for the service.
 */
const optionalInt = (field, min, label) =>
  body(field)
    .optional({ values: 'falsy' })
    .isInt({ min })
    .withMessage(`${label} must be a whole number ≥ ${min}`)
    .toInt();

// POST /api/coupons and PUT /api/coupons/:id
export const couponRules = [
  body('code')
    .isString()
    .withMessage('Code is required')
    .bail()
    .trim()
    .toUpperCase() // "eid25" → "EID25" BEFORE the pattern check and before saving
    .matches(REGEX.COUPON_CODE)
    .withMessage('Code must be 3–20 letters or digits'),
  body('description')
    .optional({ values: 'null' })
    .isString()
    .withMessage('Description must be text')
    .bail()
    .trim()
    .isLength({ max: 150 })
    .withMessage('Description must be at most 150 characters'),
  body('type').isIn(TYPES).withMessage('Type must be percentage or fixed'),
  body('value')
    .isInt({ min: 1 })
    .withMessage('Value must be a whole number ≥ 1')
    .bail()
    .toInt()
    // The allowed range depends on ANOTHER field (`type`): a custom rule can read req.body
    .custom((value, { req }) =>
      req.body.type === COUPON_TYPES.PERCENTAGE
        ? value <= LIMITS.COUPON_MAX_PERCENT
        : value <= LIMITS.COUPON_MAX_FIXED,
    )
    .withMessage(
      `Percentage must be 1–${LIMITS.COUPON_MAX_PERCENT}, fixed amount 1–${LIMITS.COUPON_MAX_FIXED}`,
    ),
  optionalInt('maxDiscount', 1, 'Max discount'),
  optionalInt('minOrderAmount', 0, 'Minimum order'),
  optionalInt('usageLimit', 1, 'Usage limit'),
  // Dates arrive as ISO 8601 text, e.g. "2026-12-31T23:59:59Z"; toDate() makes a real Date
  body('startsAt')
    .optional({ values: 'falsy' })
    .isISO8601()
    .withMessage('Invalid start date')
    .toDate(),
  body('expiresAt')
    .isISO8601()
    .withMessage('Expiry date is required (ISO 8601, e.g. 2026-12-31T23:59:59Z)')
    .bail()
    .toDate()
    // Both dates sent → compare them here (startsAt was already turned into a Date above).
    // Only expiresAt sent → the model compares it with the stored/default start date.
    .custom((expiresAt, { req }) => !req.body.startsAt || expiresAt > req.body.startsAt)
    .withMessage('Expiry must be after the start date'),
  body('isActive').optional().isBoolean().withMessage('isActive must be true or false').toBoolean(),
  // NOTE: no rules for usedCount or createdBy. The service never copies them from the body:
  // the counter only changes through checkouts and the creator always comes from the token.
];
