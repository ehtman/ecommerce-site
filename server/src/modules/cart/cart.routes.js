/**
 * src/modules/cart/cart.routes.js – the URL map of the cart module.
 * Mounted in app.js under /api/cart.
 *
 * Every route runs this pipeline, left to right:
 *   protect (who are you?) → authorize('customer') (customers only) →
 *   validateObjectId (is :productId a real id?) → validate (is the body OK?) → controller
 *
 * Admins get 403: the cart is a customer feature. There is no :cartId in any URL –
 * "my cart" is always found through the token's user id, so nobody can open another
 * customer's cart (no IDOR possible by design).
 */
import { Router } from 'express';
import { protect, authorize } from '../../middleware/auth.middleware.js';
import { validate, validateObjectId } from '../../middleware/validate.middleware.js';
import { ROLES } from '../../config/constants.js';
import * as c from './cart.controller.js';
import { addItemRules, updateItemRules } from './cart.validation.js';

const router = Router();

// Applies to EVERY route below: logged in AND role customer
router.use(protect, authorize(ROLES.CUSTOMER));

router.get('/', c.getCart);
router.post('/items', validate(addItemRules), c.addItem);
router.put(
  '/items/:productId',
  validateObjectId('productId'),
  validate(updateItemRules),
  c.updateItem,
);
router.delete('/items/:productId', validateObjectId('productId'), c.removeItem);
router.delete('/', c.clearCart); // empties the whole cart

export default router;
