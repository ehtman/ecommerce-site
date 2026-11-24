/**
 * src/modules/admin/admin.validation.js – input rules for the /api/admin routes.
 *
 * Admin routes are only reachable by admins, but we STILL validate everything: an admin's
 * browser can be buggy or hijacked, and a bad ?limit or ?from could make MongoDB scan the
 * whole database. Validation is defence in depth, not distrust of one person.
 * Run by middleware/validate.middleware.js before the controller (see admin.routes.js).
 */
import { body, query } from 'express-validator';
import { ADMIN_REPORTS, PAGINATION, ORDER_STATUS } from '../../config/constants.js';
import { isValidTimeZone } from '../../utils/dates.js';

const RANGES = Object.keys(ADMIN_REPORTS.DASHBOARD_RANGES); // ['7d', '30d', '12m']
const GROUPS = Object.keys(ADMIN_REPORTS.GROUP_FORMATS); // ['day', 'week', 'month']

// ?tz=Asia/Karachi – optional IANA time-zone name (see utils/dates.js for why it matters)
const tzRule = query('tz')
  .optional()
  .custom(isValidTimeZone) // returns true/false; false → the message below
  .withMessage('tz must be a time zone name such as UTC or Asia/Karachi');

// ?from=2026-01-01 / ?to=2026-01-31 – calendar days. `strict` also rejects 2026-02-30.
const dayRule = (field) =>
  query(field)
    .optional()
    .matches(/^\d{4}-\d{2}-\d{2}$/) // exactly YYYY-MM-DD (no times: a report covers whole days)
    .withMessage(`${field} must be a date like 2026-01-31`)
    .bail()
    .isISO8601({ strict: true })
    .withMessage(`${field} is not a real calendar date`);

// GET /api/admin/dashboard/stats?range=7d|30d|12m
export const statsRules = [
  query('range')
    .optional()
    .isIn(RANGES)
    .withMessage(`range must be one of: ${RANGES.join(', ')}`),
  tzRule,
];

// GET /api/admin/reports/sales (and its CSV export)
// "from must be before to" and "at most one year" need BOTH values, so the service checks them.
export const salesReportRules = [
  dayRule('from'),
  dayRule('to'),
  query('groupBy')
    .optional()
    .isIn(GROUPS)
    .withMessage(`groupBy must be one of: ${GROUPS.join(', ')}`),
  tzRule,
];

// GET /api/admin/reports/orders/export – same dates, plus an optional status filter
export const ordersExportRules = [
  dayRule('from'),
  dayRule('to'),
  query('status')
    .optional()
    .isIn(Object.values(ORDER_STATUS))
    .withMessage(`status must be one of: ${Object.values(ORDER_STATUS).join(', ')}`),
  tzRule,
];

// GET /api/admin/products/low-stock?threshold=5
export const lowStockRules = [
  query('threshold')
    .optional()
    .isInt({ min: 0, max: 1000 })
    .withMessage('threshold must be a whole number from 0 to 1000')
    .toInt(), // "5" (text from the URL) → 5 (a number)
];

// GET /api/admin/users?search=ali&status=active&page=1&limit=20
export const listCustomersRules = [
  query('search')
    .optional()
    .isString() // ?search[a]=b would arrive as an object: refuse it
    .withMessage('search must be text')
    .bail()
    .trim()
    .isLength({ max: 100 })
    .withMessage('search must be at most 100 characters'),
  query('status')
    .optional()
    .isIn(['active', 'inactive'])
    .withMessage('status must be active or inactive'),
  query('page').optional().isInt({ min: 1 }).withMessage('page must be 1 or more').toInt(),
  query('limit')
    .optional()
    .isInt({ min: 1, max: PAGINATION.CUSTOMERS_MAX_LIMIT })
    .withMessage(`limit must be 1–${PAGINATION.CUSTOMERS_MAX_LIMIT}`)
    .toInt(),
];

// PATCH /api/admin/users/:id/status   body: { "isActive": false }
export const statusRules = [
  // A REAL JSON boolean only. "false" (text) or 0 are refused, because a loose check could
  // turn the string "false" into true and re-activate an account by mistake.
  body('isActive')
    .custom((value) => typeof value === 'boolean')
    .withMessage('isActive must be true or false'),
];
