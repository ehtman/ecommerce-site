/**
 * src/modules/cart/cart.validation.js – input rules for the cart routes.
 *
 * Run by middleware/validate.middleware.js before the controller (see cart.routes.js).
 * Notice what is NOT here: price, name, total. The client sends only WHICH product and
 * HOW MANY. Anything else in the body (e.g. "price": 1) is simply never read: the service
 * takes prices from the database (server-side price calculation, "never trust the client").
 */
import { body } from 'express-validator';
import { LIMITS } from '../../config/constants.js';

// 1–10 whole pieces (BR-04). toInt() turns "2" into 2 so the service gets a real number.
// The STOCK check needs the database, so it happens in cart.service.js, not here.
const quantityRule = body('quantity')
  .isInt({ min: 1, max: LIMITS.MAX_CART_QTY })
  .withMessage(`Quantity must be a whole number from 1 to ${LIMITS.MAX_CART_QTY}`)
  .toInt();

// POST /api/cart/items  { productId, quantity }
export const addItemRules = [
  // isMongoId = 24 hex characters. Stops "abc" before it reaches the database.
  body('productId').isMongoId().withMessage('Invalid product id'),
  quantityRule,
];

// PUT /api/cart/items/:productId  { quantity }   (the id is checked by validateObjectId)
export const updateItemRules = [quantityRule];
