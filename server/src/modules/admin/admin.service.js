/**
 * src/modules/admin/admin.service.js – the numbers behind the admin area: dashboard,
 * sales reports, CSV exports, inventory and customer management.
 *
 * Layers: routes → controller → SERVICE → models. No req/res here; errors are ApiErrors.
 * Used by: admin.controller.js only.
 *
 * NEW IDEA: the AGGREGATION PIPELINE. Instead of loading thousands of orders into Node and
 * adding them up in a loop, we send MongoDB a list of steps ("stages") and it returns only
 * the small answer. Each stage receives the documents of the previous one:
 *   $match  → keep only some documents      (like a WHERE in SQL; can use indexes)
 *   $group  → squash many documents into one row per key, with $sum/$avg/… (GROUP BY)
 *   $unwind → turn one order with 3 items into 3 documents (one per item)
 *   $lookup → join another collection (e.g. product → its category)
 *   $facet  → run SEVERAL sub-pipelines on the SAME input in one database round trip
 *   $sort / $limit / $project → order, cut and reshape the result
 * Concept: docs/concepts/24-reporting-aggregation-and-csv.md
 */
import { Order, User, Product } from '../models.js';
import ApiError from '../../utils/ApiError.js';
import { getPagination, buildMeta } from '../../utils/pagination.js';
import { csvRow } from '../../utils/csv.js';
import { DAY_MS, startOfDayInZone, endOfDayInZone, dayInZone } from '../../utils/dates.js';
import { ADMIN_REPORTS, LIMITS, ORDER_STATUS, PAGINATION, ROLES } from '../../config/constants.js';

const R = ADMIN_REPORTS; // short alias, used a lot below

/* ====================================================================================
 * Dashboard
 * ==================================================================================== */

/**
 * Key numbers for the admin home page over a rolling window ("the last 30 days").
 * @param {{ range?: '7d'|'30d'|'12m', tz?: string }} query  validated query string
 * @param {Date} now  injectable "current time" so tests can freeze the clock
 */
export async function getDashboardStats(query = {}, now = new Date()) {
  const range = query.range || R.DEFAULT_RANGE;
  const tz = query.tz || R.DEFAULT_TIMEZONE;
  const { days, format } = R.DASHBOARD_RANGES[range];
  const from = new Date(now.getTime() - days * DAY_MS); // e.g. exactly 30×24 h ago
  const inRange = { createdAt: { $gte: from, $lte: now } }; // reused by several queries

  // Promise.all runs the 10 independent queries AT THE SAME TIME instead of one after
  // another, so the page waits for the slowest query, not for the sum of all of them.
  const [
    revenueAgg,
    totalOrders,
    byStatus,
    totalCustomers,
    newCustomers,
    totalProducts,
    lowStockCount,
    revenueSeries,
    topProducts,
    recentOrders,
  ] = await Promise.all([
    // Revenue = money we are sure about = DELIVERED orders only (pending ones may be cancelled)
    Order.aggregate([
      { $match: { ...inRange, status: ORDER_STATUS.DELIVERED } },
      { $group: { _id: null, revenue: { $sum: '$totalPrice' } } }, // _id null = one group for all
    ]),
    Order.countDocuments(inRange),
    // One row per status: [{ _id: 'pending', count: 3 }, …]
    Order.aggregate([
      { $match: inRange },
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $sort: { _id: 1 } }, // stable, alphabetical order for charts and tests
    ]),
    User.countDocuments({ role: ROLES.CUSTOMER }),
    User.countDocuments({ role: ROLES.CUSTOMER, ...inRange }),
    Product.countDocuments({ isActive: true }),
    Product.countDocuments({ isActive: true, stock: { $lte: LIMITS.LOW_STOCK_THRESHOLD } }),
    // Chart: delivered revenue per day (or per month for 12m), named in the chosen time zone
    Order.aggregate([
      { $match: { ...inRange, status: ORDER_STATUS.DELIVERED } },
      {
        $group: {
          // $dateToString turns the UTC date into text such as "2026-01-05". The
          // `timezone` option decides WHICH day a late-night order belongs to.
          _id: { $dateToString: { format, date: '$createdAt', timezone: tz } },
          revenue: { $sum: '$totalPrice' },
          orders: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } }, // oldest point first, as a chart expects
    ]),
    // Best sellers: every item of every non-cancelled order, summed per product
    Order.aggregate([
      { $match: { ...inRange, status: { $ne: ORDER_STATUS.CANCELLED } } },
      { $unwind: '$items' }, // one document per order line
      {
        $group: {
          _id: '$items.product',
          name: { $first: '$items.name' }, // the name SNAPSHOT saved in the order
          image: { $first: '$items.image' },
          sold: { $sum: '$items.quantity' },
          revenue: { $sum: '$items.subtotal' },
        },
      },
      { $sort: { sold: -1, _id: 1 } }, // _id breaks ties, so the order is always the same
      { $limit: R.TOP_PRODUCTS_DASHBOARD },
    ]),
    // The newest orders (any date), with only the fields the table shows
    Order.find()
      .sort({ createdAt: -1 })
      .limit(R.RECENT_ORDERS)
      .select('orderNumber user totalPrice status paymentStatus createdAt')
      .populate('user', 'name') // replace the user id by { _id, name }
      .lean(), // plain objects: faster, we do not need Mongoose document features
  ]);

  return {
    range,
    timezone: tz,
    from,
    to: now,
    revenue: revenueAgg[0]?.revenue || 0, // no delivered orders → no row → 0
    totalOrders,
    ordersByStatus: byStatus.map((s) => ({ status: s._id, count: s.count })),
    totalCustomers,
    newCustomers,
    totalProducts,
    lowStockCount,
    revenueSeries: revenueSeries.map((r) => ({
      date: r._id,
      revenue: r.revenue,
      orders: r.orders,
    })),
    topProducts,
    recentOrders,
  };
}

/* ====================================================================================
 * Sales report (+ CSV)
 * ==================================================================================== */

/**
 * Turns ?from / ?to (calendar days) into exact UTC instants, and enforces the rules that
 * need BOTH dates. No ?from → the last 30 days; no ?to → now.
 */
export function resolvePeriod({ from, to, tz: zone } = {}, now = new Date()) {
  const tz = zone || R.DEFAULT_TIMEZONE;
  const start = from
    ? startOfDayInZone(from, tz) // 00:00:00.000 of `from` in that zone
    : new Date(now.getTime() - R.DEFAULT_REPORT_DAYS * DAY_MS);
  const end = to ? endOfDayInZone(to, tz) : now; // 23:59:59.999 of `to` in that zone
  if (start > end) {
    throw new ApiError(400, 'Start date must be before end date', [
      { field: 'from', message: 'from must be on or before to' },
    ]);
  }
  // A cap on the period keeps one request from scanning years of orders
  if (end - start > R.MAX_REPORT_DAYS * DAY_MS) {
    throw new ApiError(400, 'Range can be at most one year', [
      { field: 'to', message: `The period can be at most ${R.MAX_REPORT_DAYS} days` },
    ]);
  }
  return { start, end, tz };
}

/**
 * Sales grouped by day / ISO week / month, plus revenue per category and top products.
 * "Sales" = every order that was NOT cancelled (pending orders count: they are real demand).
 */
export async function getSalesReport(query = {}, now = new Date()) {
  const { start, end, tz } = resolvePeriod(query, now);
  const groupBy = query.groupBy || R.DEFAULT_GROUP_BY;
  const format = R.GROUP_FORMATS[groupBy];

  // ONE trip to the database: $match once, then $facet runs three reports on the result
  const [result] = await Order.aggregate([
    // $match FIRST so the index on createdAt is used and later stages see few documents
    {
      $match: {
        createdAt: { $gte: start, $lte: end },
        status: { $ne: ORDER_STATUS.CANCELLED },
      },
    },
    {
      $facet: {
        // 1) one row per period
        rows: [
          {
            $group: {
              _id: { $dateToString: { format, date: '$createdAt', timezone: tz } },
              orders: { $sum: 1 },
              // inner $sum adds the quantities of ONE order, outer $sum adds the orders up
              itemsSold: { $sum: { $sum: '$items.quantity' } },
              revenue: { $sum: '$totalPrice' },
            },
          },
          { $sort: { _id: 1 } },
        ],
        // 2) revenue per category: order line → product → category (two joins)
        byCategory: [
          { $unwind: '$items' },
          {
            $lookup: {
              from: 'products',
              localField: 'items.product',
              foreignField: '_id',
              pipeline: [{ $project: { category: 1 } }], // fetch only what we need
              as: 'product',
            },
          },
          {
            $lookup: {
              from: 'categories',
              localField: 'product.category', // an array of 0 or 1 ids: $lookup handles it
              foreignField: '_id',
              pipeline: [{ $project: { name: 1 } }],
              as: 'category',
            },
          },
          {
            $group: {
              // A product (or category) deleted since the sale has no match: keep its money
              // in an "Uncategorised" row instead of silently dropping it from the report.
              _id: { $ifNull: [{ $first: '$category.name' }, 'Uncategorised'] },
              revenue: { $sum: '$items.subtotal' },
              itemsSold: { $sum: '$items.quantity' },
            },
          },
          { $sort: { revenue: -1, _id: 1 } },
        ],
        // 3) best products by revenue
        topProducts: [
          { $unwind: '$items' },
          {
            $group: {
              _id: '$items.product',
              name: { $first: '$items.name' },
              sold: { $sum: '$items.quantity' },
              revenue: { $sum: '$items.subtotal' },
            },
          },
          { $sort: { revenue: -1, _id: 1 } },
          { $limit: R.TOP_PRODUCTS_REPORT },
        ],
      },
    },
  ]);

  // Rename MongoDB's `_id` to friendly names and add the average order value (AOV)
  const rows = result.rows.map((r) => ({
    period: r._id,
    orders: r.orders,
    itemsSold: r.itemsSold,
    revenue: r.revenue,
    averageOrderValue: Math.round(r.revenue / r.orders), // whole rupees, like every amount
  }));
  // Grand totals = the sum of the rows (cheap: there are at most ~366 rows)
  const totals = rows.reduce(
    (t, r) => ({
      orders: t.orders + r.orders,
      itemsSold: t.itemsSold + r.itemsSold,
      revenue: t.revenue + r.revenue,
    }),
    { orders: 0, itemsSold: 0, revenue: 0 },
  );
  totals.averageOrderValue = totals.orders ? Math.round(totals.revenue / totals.orders) : 0;

  return {
    from: start,
    to: end,
    groupBy,
    timezone: tz,
    rows,
    totals,
    byCategory: result.byCategory.map((c) => ({
      category: c._id,
      revenue: c.revenue,
      itemsSold: c.itemsSold,
    })),
    topProducts: result.topProducts,
  };
}

// File names like sales-report_2026-01-01_2026-01-31.csv (days shown in the report's zone)
const fileDays = (start, end, tz) => `${dayInZone(start, tz)}_${dayInZone(end, tz)}`;

/** The sales report as CSV text: a header, one line per period and a TOTAL line. */
export async function getSalesReportCsv(query = {}, now = new Date()) {
  const report = await getSalesReport(query, now);
  const header = ['period', 'orders', 'itemsSold', 'revenue', 'averageOrderValue'];
  const lines = [
    csvRow(header),
    ...report.rows.map((r) => csvRow(header.map((key) => r[key]))),
    csvRow(['TOTAL', ...header.slice(1).map((key) => report.totals[key])]),
  ];
  return {
    filename: `sales-report_${fileDays(report.from, report.to, report.timezone)}.csv`,
    csv: lines.join(''),
  };
}

/* ====================================================================================
 * Orders export (STREAMED CSV)
 * ==================================================================================== */

export const ORDER_CSV_HEADER = [
  'orderNumber',
  'date',
  'customerName',
  'customerEmail',
  'status',
  'paymentMethod',
  'paymentStatus',
  'items',
  'itemsPrice',
  'discountPrice',
  'shippingPrice',
  'totalPrice',
];

/**
 * Prepares an export of EVERY order in the period, one CSV line per order.
 *
 * WHY STREAM? A year of orders can be tens of thousands of rows. Building one giant string
 * would hold all of it in memory at once. Instead MongoDB hands us a CURSOR (a pointer that
 * fetches documents in small batches) and we turn each document into one line as it
 * arrives. Memory stays small whatever the size of the export.
 *
 * Dates are checked HERE, before anything is sent: once the first byte of a response has
 * gone out, the status code (200) can no longer be changed to 400.
 * @returns {{ filename: string, lines: AsyncGenerator<string> }}
 */
export function prepareOrdersExport(query = {}, now = new Date()) {
  const { start, end, tz } = resolvePeriod(query, now);
  const match = { createdAt: { $gte: start, $lte: end } };
  if (query.status) match.status = query.status; // optional filter, already validated

  // async function* = an async GENERATOR: it hands out lines one by one with `yield`,
  // and only runs when someone asks for the next line (`for await` in the controller).
  async function* lines() {
    yield csvRow(ORDER_CSV_HEADER);
    const cursor = Order.aggregate([
      { $match: match },
      { $sort: { createdAt: 1, _id: 1 } }, // oldest first, like a ledger
      {
        $lookup: {
          from: 'users',
          localField: 'user',
          foreignField: '_id',
          pipeline: [{ $project: { name: 1, email: 1 } }], // never load password hashes
          as: 'customer',
        },
      },
      {
        $project: {
          orderNumber: 1,
          // Human-readable local time, e.g. "2026-01-05 14:30", in the report's zone
          date: { $dateToString: { format: '%Y-%m-%d %H:%M', date: '$createdAt', timezone: tz } },
          customerName: { $first: '$customer.name' },
          customerEmail: { $first: '$customer.email' },
          status: 1,
          paymentMethod: 1,
          paymentStatus: 1,
          items: { $sum: '$items.quantity' },
          itemsPrice: 1,
          discountPrice: 1,
          shippingPrice: 1,
          totalPrice: 1,
        },
      },
    ]).cursor({ batchSize: 200 }); // fetch 200 orders per network round trip
    for await (const doc of cursor) {
      yield csvRow(ORDER_CSV_HEADER.map((key) => doc[key]));
    }
  }

  return { filename: `orders_${fileDays(start, end, tz)}.csv`, lines: lines() };
}

/* ====================================================================================
 * Inventory
 * ==================================================================================== */

/**
 * Stock overview in ONE query: $facet computes the shop totals and the per-category table
 * side by side from the same product documents.
 */
export async function getInventoryOverview() {
  const threshold = LIMITS.LOW_STOCK_THRESHOLD;
  const active = { $eq: ['$isActive', true] }; // reusable "is this product on sale?" test
  const [result] = await Product.aggregate([
    {
      $facet: {
        totals: [
          {
            $group: {
              _id: null,
              totalProducts: { $sum: 1 },
              // $cond = if/else inside the database: count 1 for active products, else 0
              activeProducts: { $sum: { $cond: [active, 1, 0] } },
              // Units and value count ACTIVE products only: hidden ones are not for sale
              totalUnits: { $sum: { $cond: [active, '$stock', 0] } },
              stockValue: {
                $sum: { $cond: [active, { $multiply: ['$price', '$stock'] }, 0] },
              },
              outOfStockCount: {
                $sum: { $cond: [{ $and: [active, { $eq: ['$stock', 0] }] }, 1, 0] },
              },
              lowStockCount: {
                $sum: { $cond: [{ $and: [active, { $lte: ['$stock', threshold] }] }, 1, 0] },
              },
            },
          },
        ],
        byCategory: [
          { $match: { isActive: true } },
          {
            $group: {
              _id: '$category',
              products: { $sum: 1 },
              units: { $sum: '$stock' },
              stockValue: { $sum: { $multiply: ['$price', '$stock'] } },
            },
          },
          {
            $lookup: {
              from: 'categories',
              localField: '_id',
              foreignField: '_id',
              pipeline: [{ $project: { name: 1 } }],
              as: 'category',
            },
          },
          {
            $project: {
              _id: 0,
              categoryId: '$_id',
              category: { $ifNull: [{ $first: '$category.name' }, 'Uncategorised'] },
              products: 1,
              units: 1,
              stockValue: 1,
            },
          },
          { $sort: { stockValue: -1, category: 1 } },
        ],
      },
    },
  ]);

  // With zero products $group produces no row at all, so fall back to zeros
  const { _id, ...totals } = result.totals[0] || {
    _id: null,
    totalProducts: 0,
    activeProducts: 0,
    totalUnits: 0,
    stockValue: 0,
    outOfStockCount: 0,
    lowStockCount: 0,
  };
  return {
    ...totals,
    inactiveProducts: totals.totalProducts - totals.activeProducts,
    lowStockThreshold: threshold,
    byCategory: result.byCategory,
  };
}

/** Active products with stock ≤ threshold, emptiest first (what to re-order today). */
export function getLowStock({ threshold = LIMITS.LOW_STOCK_THRESHOLD } = {}) {
  return Product.find({ isActive: true, stock: { $lte: threshold } })
    .select('name slug sku price stock images category')
    .populate('category', 'name')
    .sort({ stock: 1, name: 1 })
    .limit(R.LOW_STOCK_LIST_MAX) // a hard cap: never an unbounded list
    .lean();
}

/* ====================================================================================
 * Customers
 * ==================================================================================== */

// Text typed in a search box is used inside a RegExp. Escaping turns characters such as
// "." or "(" into plain text, so "a.b" does not match "axb" and "(((" cannot crash the
// regex engine or slow it down (ReDoS).
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Customers page: search by name/email, filter by status, paginate, and add each
 * customer's order count and money spent.
 */
export async function listCustomers(query = {}) {
  // PAGINATION: ?page=2&limit=20 → skip the first 20, return the next 20, plus `meta`
  // (total, pages) so the UI can draw page buttons.
  const { page, limit, skip } = getPagination(
    query,
    PAGINATION.CUSTOMERS_DEFAULT_LIMIT,
    PAGINATION.CUSTOMERS_MAX_LIMIT,
  );
  const filter = { role: ROLES.CUSTOMER }; // admins never appear in the customer list
  if (query.search) {
    const rx = new RegExp(escapeRegex(query.search), 'i'); // 'i' = ignore upper/lower case
    filter.$or = [{ name: rx }, { email: rx }];
  }
  if (query.status === 'active') filter.isActive = true;
  if (query.status === 'inactive') filter.isActive = false;

  const [users, total] = await Promise.all([
    User.find(filter)
      .sort({ createdAt: -1, _id: -1 }) // newest customers first, stable order
      .skip(skip)
      .limit(limit)
      .lean(),
    User.countDocuments(filter),
  ]);

  // ONE extra query for the whole page (not one per customer: that would be the
  // "N+1 queries" problem). Money spent counts DELIVERED orders only.
  const counts = await Order.aggregate([
    { $match: { user: { $in: users.map((u) => u._id) } } },
    {
      $group: {
        _id: '$user',
        orders: { $sum: 1 },
        spent: {
          $sum: { $cond: [{ $eq: ['$status', ORDER_STATUS.DELIVERED] }, '$totalPrice', 0] },
        },
      },
    },
  ]);
  const byId = new Map(counts.map((c) => [String(c._id), c])); // fast lookup by user id

  // Build each row field by field: an explicit allow-list, so no secret (hash, token
  // version…) can ever slip into an admin screen
  const data = users.map((u) => ({
    _id: u._id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    isActive: u.isActive,
    isEmailVerified: u.isEmailVerified,
    authProvider: u.authProvider,
    createdAt: u.createdAt,
    orderCount: byId.get(String(u._id))?.orders || 0,
    totalSpent: byId.get(String(u._id))?.spent || 0,
  }));
  return { data, meta: buildMeta(page, limit, total) };
}

/** One customer's profile, their newest orders and a small summary. */
export async function getCustomer(id) {
  // Least privilege: this screen is for CUSTOMERS. An admin's id gets the same 404 as an
  // unknown id, so the customer page cannot be used to look at other admins.
  const user = await User.findOne({ _id: id, role: ROLES.CUSTOMER });
  if (!user) throw new ApiError(404, 'Customer not found');

  const [orders, [summary]] = await Promise.all([
    Order.find({ user: id })
      .select('orderNumber totalPrice status paymentStatus paymentMethod createdAt')
      .sort({ createdAt: -1 })
      .limit(R.CUSTOMER_DETAIL_ORDERS)
      .lean(),
    Order.aggregate([
      { $match: { user: user._id } },
      {
        $group: {
          _id: null,
          orderCount: { $sum: 1 },
          totalSpent: {
            $sum: { $cond: [{ $eq: ['$status', ORDER_STATUS.DELIVERED] }, '$totalPrice', 0] },
          },
        },
      },
    ]),
  ]);
  return {
    user, // toJSON plugin removes the password hash and tokens
    orders,
    summary: { orderCount: summary?.orderCount || 0, totalSpent: summary?.totalSpent || 0 },
  };
}

/**
 * Activate / deactivate a customer. A deactivated customer is locked out at once: the
 * `protect` middleware reloads the user on EVERY request and answers 403 "Account disabled".
 */
export async function setCustomerStatus(adminId, id, isActive) {
  // An admin locking themselves out would leave the shop without an admin
  if (String(adminId) === String(id)) {
    throw new ApiError(400, 'You cannot change your own status');
  }
  const user = await User.findById(id);
  if (!user) throw new ApiError(404, 'Customer not found');
  // Admins are managed with database access (seed script), never from this screen
  if (user.role === ROLES.ADMIN) {
    throw new ApiError(400, 'Admin accounts cannot be deactivated here');
  }
  user.isActive = isActive;
  // validateModifiedOnly: only re-check the changed field (old accounts may predate a rule)
  await user.save({ validateModifiedOnly: true });
  return user;
}
