/**
 * src/modules/admin/admin.routes.js – the URL map of the admin area. Mounted at /api/admin.
 *
 * LEAST PRIVILEGE: one `router.use(protect, authorize('admin'))` line guards EVERY route
 * below, so a new admin route can never be added "unprotected by accident". Customers get
 * 403, visitors without a token 401, before any admin code runs.
 *
 * Pipeline per route: protect → authorize('admin') → validateObjectId / validate → controller
 *
 * This module owns the ADMIN-ONLY features (dashboard, reports, exports, inventory,
 * customers). The admin endpoints of other modules (categories, products, orders, reviews,
 * coupons) are mounted here too as thin re-exports: their logic stays in their own module,
 * only the URL lives under /api/admin, exactly the URLs the reference client (adminApi.js)
 * calls. Some also exist on the module's own prefix (e.g. /api/coupons, /api/reviews/admin).
 */
import { Router } from 'express';
import { protect, authorize } from '../../middleware/auth.middleware.js';
import { validate, validateObjectId } from '../../middleware/validate.middleware.js';
import { ROLES } from '../../config/constants.js';
import * as c from './admin.controller.js';
import * as v from './admin.validation.js';
// Handlers owned by other modules (re-exported here, no new logic)
import * as categories from '../categories/category.controller.js';
import * as products from '../products/product.controller.js';
import * as orders from '../orders/order.controller.js';
import {
  listRules as orderListRules,
  statusRules as orderStatusRules,
} from '../orders/order.validation.js';
import * as reviews from '../reviews/review.controller.js';
import {
  adminListRules as reviewListRules,
  visibilityRules,
} from '../reviews/review.validation.js';
import * as coupons from '../coupons/coupon.controller.js';
import { couponRules } from '../coupons/coupon.validation.js';

const router = Router();

// Applies to every route of this router: logged in AND role admin
router.use(protect, authorize(ROLES.ADMIN));

// ---------- Dashboard & reports ----------
router.get('/dashboard/stats', validate(v.statsRules), c.dashboardStats);
router.get('/reports/sales', validate(v.salesReportRules), c.salesReport);
router.get('/reports/sales/export', validate(v.salesReportRules), c.salesReportCsv);
router.get('/reports/orders/export', validate(v.ordersExportRules), c.ordersCsv);

// ---------- Inventory ----------
router.get('/inventory', c.inventory);
// The ONE low-stock route. Declared before '/products/:id', so "low-stock" is never read as an id
router.get('/products/low-stock', validate(v.lowStockRules), c.lowStock);

// ---------- Catalogue (categories, products modules) ----------
router.get('/categories', categories.adminList); // every category + productCount
router.get('/products', products.adminList); // inactive too, search/filter/pagination
router.get('/products/:id', validateObjectId('id'), products.adminGet);

// ---------- Orders (orders module) ----------
router.get('/orders', validate(orderListRules), orders.adminList);
router.patch(
  '/orders/:id/status',
  validateObjectId('id'),
  validate(orderStatusRules),
  orders.adminUpdateStatus,
);

// ---------- Reviews moderation (reviews module; also at /api/reviews/admin) ----------
router.get('/reviews', validate(reviewListRules), reviews.adminList);
router.patch(
  '/reviews/:id/visibility',
  validateObjectId('id'),
  validate(visibilityRules),
  reviews.setVisibility,
);

// ---------- Coupons (coupons module; also at /api/coupons) ----------
router.get('/coupons', coupons.list);
router.post('/coupons', validate(couponRules), coupons.create);
router.put('/coupons/:id', validateObjectId('id'), validate(couponRules), coupons.update);
router.delete('/coupons/:id', validateObjectId('id'), coupons.remove);

// ---------- Customers ----------
router.get('/users', validate(v.listCustomersRules), c.listCustomers);
router.get('/users/:id', validateObjectId('id'), c.getCustomer);
router.patch(
  '/users/:id/status',
  validateObjectId('id'),
  validate(v.statusRules),
  c.setCustomerStatus,
);

export default router;
