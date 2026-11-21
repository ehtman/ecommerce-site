/**
 * src/modules/wishlist/wishlist.routes.js – the URL map of the wishlist module.
 * Mounted in app.js under /api/wishlist.
 *
 * Pipeline: protect → authorize('customer') → validateObjectId → controller.
 * There is no request body at all: the product id is in the URL and the owner comes from
 * the token. Admins get 403 (customer feature).
 */
import { Router } from 'express';
import { protect, authorize } from '../../middleware/auth.middleware.js';
import { validateObjectId } from '../../middleware/validate.middleware.js';
import { ROLES } from '../../config/constants.js';
import * as c from './wishlist.controller.js';

const router = Router();

// Applies to EVERY route below: logged in AND role customer
router.use(protect, authorize(ROLES.CUSTOMER));

router.get('/', c.getWishlist);
router.post('/:productId', validateObjectId('productId'), c.addProduct);
router.delete('/:productId', validateObjectId('productId'), c.removeProduct);

export default router;
