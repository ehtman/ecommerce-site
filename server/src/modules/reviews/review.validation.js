/**
 * src/modules/reviews/review.validation.js – input rules for the review routes.
 *
 * Run by middleware/validate.middleware.js before the controller (see review.routes.js
 * and the nested routes in products/product.routes.js). The model repeats the important
 * rules (defence in depth), so even code that skips this file cannot save a 7-star review.
 */
import { body, query } from 'express-validator';
import { REVIEW } from '../../config/constants.js';

const { RATING_MIN, RATING_MAX, TITLE_MAX, COMMENT_MIN, COMMENT_MAX } = REVIEW;

// POST /api/products/:id/reviews and PUT /api/reviews/:id
// The same rules for both: the review form always sends the WHOLE review (rating + text).
export const reviewRules = [
  body('rating')
    // isInt rejects 4.5, "five" and 0. toInt() turns "4" (from an HTML form) into 4.
    .isInt({ min: RATING_MIN, max: RATING_MAX })
    .withMessage(`Rating must be a whole number from ${RATING_MIN} to ${RATING_MAX}`)
    .toInt(),
  body('title')
    .optional({ values: 'falsy' }) // "" or null = no headline
    .isString()
    .withMessage('Title must be text')
    .bail() // stop here: trim() on a non-string would crash
    .trim()
    .isLength({ max: TITLE_MAX })
    .withMessage(`Title must be at most ${TITLE_MAX} characters`),
  body('comment')
    .isString()
    .withMessage('Comment is required')
    .bail()
    .trim() // "   good   " counts as 4 characters, not 10
    .isLength({ min: COMMENT_MIN, max: COMMENT_MAX })
    .withMessage(`Comment must be ${COMMENT_MIN}–${COMMENT_MAX} characters`),
  // NOTE: no rules for `user`, `product`, `order` or `isVisible`. The service never reads
  // them from the body (mass assignment protection): a customer cannot un-hide their own
  // review or post one "as" somebody else.
];

// PATCH /api/reviews/:id/visibility (admin moderation)
export const visibilityRules = [
  body('isVisible')
    // isBoolean accepts true/false and "true"/"false"; toBoolean() makes them real booleans
    .isBoolean()
    .withMessage('isVisible must be true or false')
    .toBoolean(),
];

// GET /api/reviews/admin?rating=&visibility=&product= (admin moderation list)
// Optional filters: when one is sent, it must make sense (a typo should not silently
// return "everything", which would confuse the moderator).
export const adminListRules = [
  query('rating')
    .optional()
    .isInt({ min: RATING_MIN, max: RATING_MAX })
    .withMessage(`Rating must be ${RATING_MIN}–${RATING_MAX}`)
    .toInt(),
  query('visibility')
    .optional()
    .isIn(['visible', 'hidden'])
    .withMessage('Visibility must be visible or hidden'),
  query('product').optional().isMongoId().withMessage('Invalid product id'),
];
