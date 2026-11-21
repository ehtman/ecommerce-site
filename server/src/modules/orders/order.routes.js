/**
 * src/modules/orders/order.routes.js – the URL maps of the orders module.
 *
 * Two routers live here:
 *   default export     → mounted in app.js under /api/orders        (customers, + admin read)
 *   adminOrderRoutes   → mounted in app.js under /api/admin/orders  (admins only)
 * Branch 10 (admin) collects every admin route in modules/admin/admin.routes.js and will
 * move the two admin order routes there; the URLs stay exactly the same.
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
import { placeOrderRules, cancelRules, statusRules, listRules } from './order.validation.js';

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

/* ---------- /api/admin/orders (branch 10 moves these into admin.routes.js) ---------- */
export const adminOrderRoutes = Router();
adminOrderRoutes.use(protect, authorize(ROLES.ADMIN)); // admins only

adminOrderRoutes.get('/', validate(listRules), c.adminList);
adminOrderRoutes.patch(
  '/:id/status',
  validateObjectId('id'),
  validate(statusRules),
  c.adminUpdateStatus,
);
