/**
 * src/modules/reviews/review.routes.js – the URL map for ONE existing review.
 * Mounted in app.js under /api/reviews.
 *
 * WHERE ARE "LIST" AND "CREATE"? A review always belongs to a product, so those live
 * NESTED under the product: GET/POST /api/products/:id/reviews (see products/product.routes.js).
 * Once a review exists it has its own id, so editing/deleting/moderating it happens here.
 *
 * Pipeline per route: protect → authorize (role) → validateObjectId → validate → controller.
 * Ownership ("is this MY review?") is checked in the SERVICE: only the database knows.
 *
 * Admin moderation routes: the reference project mounts them at /api/admin/reviews… in the
 * admin module (branch 10). Until that module exists they live here, under the same
 * controllers; branch 10 can add /api/admin aliases without changing any logic.
 */
import { Router } from 'express';
import { protect, authorize } from '../../middleware/auth.middleware.js';
import { validate, validateObjectId } from '../../middleware/validate.middleware.js';
import { ROLES } from '../../config/constants.js';
import * as c from './review.controller.js';
import { reviewRules, visibilityRules, adminListRules } from './review.validation.js';

const router = Router();

// Every route below needs a logged-in user
router.use(protect);

// ---------- Admin moderation ----------
// Declared BEFORE '/:id' style routes so the word "admin" is never mistaken for an id.
router.get('/admin', authorize(ROLES.ADMIN), validate(adminListRules), c.adminList);
router.patch(
  '/:id/visibility',
  authorize(ROLES.ADMIN),
  validateObjectId('id'),
  validate(visibilityRules),
  c.setVisibility,
);

// ---------- Author ----------
// Only customers write reviews, so only customers edit them (admins hide/delete instead)
router.put(
  '/:id',
  authorize(ROLES.CUSTOMER),
  validateObjectId('id'),
  validate(reviewRules),
  c.update,
);
// No authorize(): the author OR an admin may delete. The service decides which reviews match.
router.delete('/:id', validateObjectId('id'), c.remove);

export default router;
