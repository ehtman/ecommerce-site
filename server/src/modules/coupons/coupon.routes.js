/**
 * src/modules/coupons/coupon.routes.js – the URL map of the coupons module.
 * Mounted in app.js under /api/coupons.
 *
 *   POST   /validate  customer  preview a code on MY cart (does not use it up)
 *   GET    /          admin     list every coupon (with its `state`)
 *   GET    /:id       admin     one coupon
 *   POST   /          admin     create
 *   PUT    /:id       admin     replace its settings
 *   DELETE /:id       admin     delete (or deactivate when already used)
 *
 * Pipeline, left to right: protect (who are you?) → authorize(role) → validateObjectId
 * → validate(rules) → controller. Admins cannot preview (they have no cart) and customers
 * cannot see the coupon list (that would publish every secret code).
 */
import { Router } from 'express';
import { protect, authorize } from '../../middleware/auth.middleware.js';
import { validate, validateObjectId } from '../../middleware/validate.middleware.js';
import { ROLES } from '../../config/constants.js';
import * as c from './coupon.controller.js';
import { couponRules, validateCouponRules } from './coupon.validation.js';

const router = Router();
const admin = [protect, authorize(ROLES.ADMIN)]; // reused by every admin route below

// Customer. Declared BEFORE '/:id' routes; it is a POST anyway, so it can never clash with them.
router.post(
  '/validate',
  protect,
  authorize(ROLES.CUSTOMER),
  validate(validateCouponRules),
  c.validateCoupon,
);

// Admin
router.get('/', ...admin, c.list);
router.get('/:id', ...admin, validateObjectId('id'), c.getOne);
router.post('/', ...admin, validate(couponRules), c.create);
router.put('/:id', ...admin, validateObjectId('id'), validate(couponRules), c.update);
router.delete('/:id', ...admin, validateObjectId('id'), c.remove);

export default router;
