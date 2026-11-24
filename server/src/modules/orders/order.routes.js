/**
 * src/modules/orders/order.routes.js – the URL map of the orders module.
 * Mounted in app.js under /api/orders (customers, + admin read of one order).
 * The admin order routes (/api/admin/orders…) live in modules/admin/admin.routes.js since
 * branch 10, which collects every /api/admin route; they reuse this module's controller.
 *
 * Pipeline of each route, left to right:
 *   protect (who are you?) → authorize (right role?) → requireVerifiedEmail (BR-12)
 *   → validateObjectId (is :id a real id?) → validate (is the input OK?) → controller
 * Ownership ("is this MY order?") is checked in the SERVICE, because only the database
 * knows who owns order X.
 */
import { Router } from 'express';
import { protect, authorize, requireVerifiedEmail } from '../../middleware/auth.middleware.js';
import { validate, validateObjectId } from '../../middleware/validate.middleware.js';
import { ROLES } from '../../config/constants.js';
import * as c from './order.controller.js';
import { placeOrderRules, cancelRules, listRules } from './order.validation.js';

/* ---------- /api/orders ---------- */
const router = Router();
router.use(protect); // every order route needs a login

const customer = authorize(ROLES.CUSTOMER); // admins do not buy

// Placing an order needs a VERIFIED email (BR-12): we must be able to reach the customer
router.post('/', customer, requireVerifiedEmail, validate(placeOrderRules), c.placeOrder);
// '/my' is declared BEFORE '/:id', otherwise Express would treat "my" as an id
router.get('/my', customer, validate(listRules), c.getMyOrders);
// No authorize() here: the owner OR an admin may read it (the service decides)
router.get('/:id', validateObjectId('id'), c.getOrderById);
router.patch('/:id/cancel', customer, validateObjectId('id'), validate(cancelRules), c.cancelOrder);

export default router;

// The admin order routes (GET /api/admin/orders, PATCH /api/admin/orders/:id/status) are
// mounted by the admin module (admin.routes.js) with c.adminList / c.adminUpdateStatus.
