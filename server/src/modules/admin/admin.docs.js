/**
 * src/modules/admin/admin.docs.js – OpenAPI description of the /admin routes.
 * Merged into the full spec by src/docs/openapi.js. Keep it in sync with admin.routes.js.
 */
import { ADMIN_REPORTS, LIMITS, ORDER_STATUS, PAGINATION } from '../../config/constants.js';
import couponDocs from '../coupons/coupon.docs.js';
import reviewDocs from '../reviews/review.docs.js';

// Small helpers so each route below stays short and readable (same as address.docs.js)
const json = (schema) => ({ content: { 'application/json': { schema } } });
const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const err = (name) => ({ $ref: `#/components/responses/${name}` });
const secured = [{ bearerAuth: [] }]; // marks a route as "needs a token"
const tags = ['Admin'];

// Success envelope around any `data` schema (+ optional pagination meta)
const envelope = (data, extra = {}) =>
  json({
    type: 'object',
    properties: {
      success: { type: 'boolean', example: true },
      message: { type: 'string' },
      data,
      ...extra,
    },
  });
const obj = (properties) => ({ type: 'object', properties });
const int = (example) => ({ type: 'integer', example });

// Every admin route has the same guard errors
const guarded = {
  401: err('Unauthorized'),
  403: { description: 'Logged in, but not an admin', ...json(ref('Error')) },
};

// ---------- Query parameters ----------
const q = (name, schema, description) => ({
  name,
  in: 'query',
  required: false,
  schema,
  description,
});
const tzParam = q(
  'tz',
  { type: 'string', example: 'Asia/Karachi', default: ADMIN_REPORTS.DEFAULT_TIMEZONE },
  'IANA time zone that decides which calendar day an order belongs to',
);
const dayParam = (name, description) =>
  q(
    name,
    { type: 'string', format: 'date', example: name === 'from' ? '2026-01-01' : '2026-01-31' },
    description,
  );
const periodParams = [
  dayParam(
    'from',
    `First day (YYYY-MM-DD). Default: ${ADMIN_REPORTS.DEFAULT_REPORT_DAYS} days ago`,
  ),
  dayParam(
    'to',
    `Last day, included (YYYY-MM-DD). Default: now. Max period ${ADMIN_REPORTS.MAX_REPORT_DAYS} days`,
  ),
];
const groupByParam = q(
  'groupBy',
  { type: 'string', enum: Object.keys(ADMIN_REPORTS.GROUP_FORMATS), default: 'day' },
  'Bucket size: day (2026-01-05), ISO week (2026-W02) or month (2026-01)',
);
const idParam = {
  name: 'id',
  in: 'path',
  required: true,
  description: 'Customer id (24-character ObjectId)',
  schema: { type: 'string', example: '665f1c2e9b1e8a0012345678' },
};

// ---------- Response shapes ----------
const salesRow = obj({
  period: { type: 'string', example: '2026-01-05' },
  orders: int(2),
  itemsSold: int(3),
  revenue: int(5500),
  averageOrderValue: int(2750),
});
const topProduct = obj({
  _id: { type: 'string' },
  name: { type: 'string', example: 'Wireless Over-Ear Headphones' },
  image: { type: 'string', description: 'Dashboard only' },
  sold: int(3),
  revenue: int(9000),
});
const customerRow = obj({
  _id: { type: 'string' },
  name: { type: 'string', example: 'Ali Khan' },
  email: { type: 'string', example: 'ali@example.com' },
  phone: { type: 'string', example: '03001234567' },
  isActive: { type: 'boolean' },
  isEmailVerified: { type: 'boolean' },
  authProvider: { type: 'string', enum: ['local', 'google'] },
  createdAt: { type: 'string', format: 'date-time' },
  orderCount: int(2),
  totalSpent: { type: 'integer', example: 2250, description: 'Delivered orders only' },
});
const csv = (description, example) => ({
  description,
  headers: {
    'Content-Disposition': {
      schema: {
        type: 'string',
        example: 'attachment; filename="sales-report_2026-01-01_2026-01-31.csv"',
      },
    },
  },
  content: { 'text/csv': { schema: { type: 'string', example } } },
});

// ---------- Re-exported admin routes of other modules ----------
// /api/admin/coupons… and /api/admin/reviews… run the SAME handlers as /api/coupons… and
// /api/reviews/admin…, so their docs are copied from those modules (only the tag changes).
// /api/admin/orders… are documented by the orders module (order.docs.js).
const alias = (path, methods) => Object.fromEntries(methods.map((m) => [m, { ...path[m], tags }]));
const productIdParam = { ...idParam, description: 'Product id (24-character ObjectId)' };
const adminCatalogPaths = {
  '/admin/categories': {
    get: {
      tags,
      summary: 'Every category (inactive too) with its productCount',
      security: secured,
      responses: {
        200: {
          description: 'Categories fetched',
          ...envelope({
            type: 'array',
            items: {
              allOf: [ref('Category'), obj({ productCount: int(3) })],
            },
          }),
        },
        ...guarded,
      },
    },
  },
  '/admin/products': {
    get: {
      tags,
      summary: 'Every product (inactive too), newest first, paginated',
      security: secured,
      parameters: [
        q('page', { type: 'integer', minimum: 1, default: 1 }, 'Page number'),
        q('limit', { type: 'integer', minimum: 1 }, 'Products per page'),
        q('search', { type: 'string' }, 'Part of the name or SKU (case-insensitive)'),
        q('category', { type: 'string' }, 'Category id'),
        q('status', { type: 'string', enum: ['active', 'inactive'] }, 'Active or inactive only'),
        q('sort', { type: 'string', enum: ['stock'] }, 'stock = lowest stock first'),
      ],
      responses: {
        200: {
          description: 'Products fetched',
          ...envelope({ type: 'array', items: ref('Product') }, { meta: ref('PageMeta') }),
        },
        ...guarded,
      },
    },
  },
  '/admin/products/{id}': {
    get: {
      tags,
      summary: 'One product, active or not, with its stock history',
      security: secured,
      parameters: [productIdParam],
      responses: {
        200: { description: 'Product fetched', ...envelope(ref('Product')) },
        400: err('BadRequest'),
        ...guarded,
        404: err('NotFound'),
      },
    },
  },
  '/admin/reviews': alias(reviewDocs.paths['/reviews/admin'], ['get']),
  '/admin/reviews/{id}/visibility': alias(reviewDocs.paths['/reviews/{id}/visibility'], ['patch']),
  '/admin/coupons': alias(couponDocs.paths['/coupons'], ['get', 'post']),
  '/admin/coupons/{id}': alias(couponDocs.paths['/coupons/{id}'], ['put', 'delete']),
};

export default {
  tags: [
    {
      name: 'Admin',
      description:
        'Admin only: dashboard, sales reports, CSV exports, inventory and customer management',
    },
  ],
  paths: {
    '/admin/dashboard/stats': {
      get: {
        tags,
        summary: 'Dashboard numbers for a rolling window (revenue = delivered orders)',
        security: secured,
        parameters: [
          q(
            'range',
            { type: 'string', enum: Object.keys(ADMIN_REPORTS.DASHBOARD_RANGES), default: '30d' },
            '7d and 30d chart per day, 12m per month',
          ),
          tzParam,
        ],
        responses: {
          200: {
            description: 'Dashboard stats',
            ...envelope(
              obj({
                range: { type: 'string', example: '30d' },
                timezone: { type: 'string', example: 'UTC' },
                from: { type: 'string', format: 'date-time' },
                to: { type: 'string', format: 'date-time' },
                revenue: int(8250),
                totalOrders: int(4),
                ordersByStatus: {
                  type: 'array',
                  items: obj({ status: { type: 'string', example: 'delivered' }, count: int(2) }),
                },
                totalCustomers: int(3),
                newCustomers: int(2),
                totalProducts: int(30),
                lowStockCount: int(2),
                revenueSeries: {
                  type: 'array',
                  items: obj({
                    date: { type: 'string', example: '2026-01-05' },
                    revenue: int(2250),
                    orders: int(1),
                  }),
                },
                topProducts: { type: 'array', items: topProduct },
                recentOrders: { type: 'array', items: { type: 'object' } },
              }),
            ),
          },
          400: err('BadRequest'),
          ...guarded,
        },
      },
    },
    '/admin/reports/sales': {
      get: {
        tags,
        summary: 'Sales per day/week/month, per category and top products (cancelled excluded)',
        security: secured,
        parameters: [...periodParams, groupByParam, tzParam],
        responses: {
          200: {
            description: 'Sales report',
            ...envelope(
              obj({
                from: { type: 'string', format: 'date-time' },
                to: { type: 'string', format: 'date-time' },
                groupBy: { type: 'string', example: 'day' },
                timezone: { type: 'string', example: 'UTC' },
                rows: { type: 'array', items: salesRow },
                totals: salesRow,
                byCategory: {
                  type: 'array',
                  items: obj({
                    category: { type: 'string', example: 'Audio' },
                    revenue: int(3000),
                    itemsSold: int(1),
                  }),
                },
                topProducts: { type: 'array', items: topProduct },
              }),
            ),
          },
          400: {
            description: 'Bad date / groupBy / tz, from after to, or more than one year',
            ...json(ref('Error')),
          },
          ...guarded,
        },
      },
    },
    '/admin/reports/sales/export': {
      get: {
        tags,
        summary: 'Download the sales report as a CSV file',
        security: secured,
        parameters: [...periodParams, groupByParam, tzParam],
        responses: {
          200: csv(
            'CSV file (UTF-8 with BOM, CRLF line endings)',
            'period,orders,itemsSold,revenue,averageOrderValue\r\n2026-01-05,2,3,5500,2750\r\nTOTAL,2,3,5500,2750\r\n',
          ),
          400: err('BadRequest'),
          ...guarded,
        },
      },
    },
    '/admin/reports/orders/export': {
      get: {
        tags,
        summary: 'Download every order of the period as a CSV file (streamed)',
        security: secured,
        parameters: [
          ...periodParams,
          q(
            'status',
            { type: 'string', enum: Object.values(ORDER_STATUS) },
            'Only orders with this status',
          ),
          tzParam,
        ],
        responses: {
          200: csv(
            'CSV file, one line per order, oldest first',
            'orderNumber,date,customerName,customerEmail,status,paymentMethod,paymentStatus,items,itemsPrice,discountPrice,shippingPrice,totalPrice\r\n',
          ),
          400: err('BadRequest'),
          ...guarded,
        },
      },
    },
    '/admin/inventory': {
      get: {
        tags,
        summary: 'Stock overview: totals and a per-category table',
        security: secured,
        responses: {
          200: {
            description: 'Inventory overview',
            ...envelope(
              obj({
                totalProducts: int(31),
                activeProducts: int(30),
                inactiveProducts: int(1),
                totalUnits: int(812),
                stockValue: {
                  type: 'integer',
                  example: 4250000,
                  description: 'Σ price × stock (active)',
                },
                outOfStockCount: int(1),
                lowStockCount: int(5),
                lowStockThreshold: int(LIMITS.LOW_STOCK_THRESHOLD),
                byCategory: {
                  type: 'array',
                  items: obj({
                    categoryId: { type: 'string' },
                    category: { type: 'string', example: 'Audio' },
                    products: int(3),
                    units: int(69),
                    stockValue: int(491935),
                  }),
                },
              }),
            ),
          },
          ...guarded,
        },
      },
    },
    '/admin/products/low-stock': {
      get: {
        tags,
        summary: `Active products with stock ≤ threshold (default ${LIMITS.LOW_STOCK_THRESHOLD}), emptiest first`,
        security: secured,
        parameters: [q('threshold', { type: 'integer', minimum: 0, maximum: 1000 }, 'Stock limit')],
        responses: {
          200: {
            description: `Low-stock products (max ${ADMIN_REPORTS.LOW_STOCK_LIST_MAX})`,
            ...envelope({ type: 'array', items: { type: 'object' } }),
          },
          400: err('BadRequest'),
          ...guarded,
        },
      },
    },
    '/admin/users': {
      get: {
        tags,
        summary: 'Customers with order count and money spent (search, status, pages)',
        security: secured,
        parameters: [
          q(
            'search',
            { type: 'string', maxLength: 100 },
            'Part of the name or email (case-insensitive)',
          ),
          q('status', { type: 'string', enum: ['active', 'inactive'] }, 'Account status'),
          q('page', { type: 'integer', minimum: 1, default: 1 }, 'Page number'),
          q(
            'limit',
            {
              type: 'integer',
              minimum: 1,
              maximum: PAGINATION.CUSTOMERS_MAX_LIMIT,
              default: PAGINATION.CUSTOMERS_DEFAULT_LIMIT,
            },
            'Rows per page',
          ),
        ],
        responses: {
          200: {
            description: 'Customers fetched',
            ...envelope(
              { type: 'array', items: customerRow },
              { meta: obj({ page: int(1), limit: int(20), total: int(42), pages: int(3) }) },
            ),
          },
          400: err('BadRequest'),
          ...guarded,
        },
      },
    },
    '/admin/users/{id}': {
      get: {
        tags,
        summary: 'One customer: profile, newest orders and a summary',
        security: secured,
        parameters: [idParam],
        responses: {
          200: {
            description: 'Customer fetched',
            ...envelope(
              obj({
                user: ref('User'),
                orders: { type: 'array', items: { type: 'object' } },
                summary: obj({ orderCount: int(2), totalSpent: int(2250) }),
              }),
            ),
          },
          400: err('BadRequest'),
          ...guarded,
          404: {
            description: 'No customer with this id (admins are not customers)',
            ...json(ref('Error')),
          },
        },
      },
    },
    '/admin/users/{id}/status': {
      patch: {
        tags,
        summary: 'Activate or deactivate a customer (their tokens stop working at once)',
        security: secured,
        parameters: [idParam],
        requestBody: {
          required: true,
          ...json({
            type: 'object',
            required: ['isActive'],
            properties: { isActive: { type: 'boolean', example: false } },
          }),
        },
        responses: {
          200: { description: 'Customer activated / deactivated', ...envelope(ref('User')) },
          400: {
            description: 'isActive not a boolean, your own account, or an admin account',
            ...json(ref('Error')),
          },
          ...guarded,
          404: err('NotFound'),
        },
      },
    },
    ...adminCatalogPaths,
  },
};
