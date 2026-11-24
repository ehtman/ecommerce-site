/**
 * src/modules/products/product.routes.js – the URL map of the products module.
 * Mounted in app.js under /api/products.
 *
 * PUBLIC routes (no login): browse, search and open products. Only ACTIVE products.
 * ADMIN routes: protect (who are you?) → authorize('admin') → validateObjectId → validate
 * → controller.
 * REVIEWS (branch 09): listing and writing a product's reviews are nested under the product.
 *
 * ORDER MATTERS: Express tries routes top to bottom. '/brands' must come BEFORE '/:slug',
 * otherwise "brands" would be treated as a product slug.
 */
import { Router } from 'express';
import { protect, authorize } from '../../middleware/auth.middleware.js';
import { validate, validateObjectId } from '../../middleware/validate.middleware.js';
import { ROLES } from '../../config/constants.js';
import * as c from './product.controller.js';
import { productRules, stockRules } from './product.validation.js';
// Reviews (branch 09): a review always belongs to a product, so "list" and "write" are
// NESTED under the product URL. :id here is the PRODUCT id (not a slug).
import * as reviews from '../reviews/review.controller.js';
import { reviewRules } from '../reviews/review.validation.js';

const router = Router();
// The two guards every admin route starts with
const admin = [protect, authorize(ROLES.ADMIN)];

// ---------- Public ----------
router.get('/', c.list);
router.get('/brands', c.brands);
router.get('/:slug', c.getBySlug);

// ---------- Reviews nested under a product id (branch 09) ----------
// Two-segment paths never clash with GET /:slug.
// Public: anyone may read the visible reviews of a product
router.get('/:id/reviews', validateObjectId('id'), reviews.listForProduct);
// Logged-in: "may I review this?" (the UI shows or hides the review form)
router.get('/:id/reviews/eligibility', protect, validateObjectId('id'), reviews.eligibility);
// Customers only; the service also checks "delivered order" and "not reviewed yet"
router.post(
  '/:id/reviews',
  protect,
  authorize(ROLES.CUSTOMER),
  validateObjectId('id'),
  validate(reviewRules),
  reviews.create,
);

// ---------- Admin ----------
router.post('/', ...admin, validate(productRules), c.create);
router.put('/:id', ...admin, validateObjectId('id'), validate(productRules), c.update);
router.delete('/:id', ...admin, validateObjectId('id'), c.remove);
// Both ids in the URL must be real ObjectIds
router.delete('/:id/images/:imageId', ...admin, validateObjectId('id', 'imageId'), c.removeImage);
// PATCH = change PART of the product: only its stock
router.patch('/:id/stock', ...admin, validateObjectId('id'), validate(stockRules), c.updateStock);

export default router;
