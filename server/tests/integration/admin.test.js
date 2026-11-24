/**
 * INTEGRATION tests for /api/admin: dashboard, sales report, CSV exports, inventory,
 * low stock and customer management.
 *
 * Every test builds a SMALL, KNOWN data set, so the statistics can be asserted EXACTLY
 * (e.g. "revenue is 8250"), not just "is a number". If an aggregation stage is wrong,
 * a number changes and the test fails.
 */
import { jest } from '@jest/globals';
import { connectTestDB, clearTestDB, closeTestDB } from '../helpers/db.js';
import {
  api,
  bearer,
  createAdmin,
  createUser,
  createCategory,
  createProduct,
  loggedIn,
} from '../helpers/factories.js';
import { Order, User } from '../../src/modules/models.js';
import { DAY_MS, dayInZone } from '../../src/utils/dates.js';

beforeAll(connectTestDB);
afterEach(async () => {
  jest.restoreAllMocks(); // undo any spy from a test
  await clearTestDB();
});
afterAll(closeTestDB);

// An admin and their Authorization header, created fresh for each test
async function adminAuth() {
  const admin = await createAdmin();
  return { admin, auth: bearer(admin) };
}

/**
 * Saves an order with a known status at a precise moment, straight into the database.
 * Built here (not with the orders factory) so the numbers below depend ONLY on this file:
 * items [{ product, quantity }] → snapshot lines; shipping 250 below Rs 5,000, else free.
 * A delivered COD order is paid, exactly as the orders module does it.
 */
async function orderAt(user, lines, createdAt, status = 'pending') {
  const items = lines.map(({ product, quantity = 1 }) => ({
    product: product._id,
    name: product.name,
    slug: product.slug,
    sku: product.sku,
    image: product.images[0].url,
    price: product.price,
    quantity,
    subtotal: product.price * quantity,
  }));
  const itemsPrice = items.reduce((sum, i) => sum + i.subtotal, 0);
  const shippingPrice = itemsPrice >= 5000 ? 0 : 250;
  const order = await Order.create({
    user: user._id,
    items,
    shippingAddress: {
      fullName: 'Ali Khan',
      phone: '03001234567',
      addressLine1: 'House 12, Street 4, Gulberg III',
      city: 'Lahore',
      province: 'Punjab',
      postalCode: '54000',
    },
    itemsPrice,
    shippingPrice,
    totalPrice: itemsPrice + shippingPrice,
    status,
    paymentStatus: status === 'delivered' ? 'paid' : 'pending',
  });
  // `timestamps` would overwrite createdAt on save, so set it with a raw driver update
  await Order.collection.updateOne({ _id: order._id }, { $set: { createdAt } });
  // createdAt is immutable on a Mongoose document, so return a plain copy with the real value
  return { ...order.toObject(), createdAt };
}

/* ------------------------------------------------------------------------------------
 * Guards: every admin route needs a token (401) and the admin role (403)
 * ---------------------------------------------------------------------------------- */
describe('admin guards (least privilege)', () => {
  const id = '665f1c2e9b1e8a0012345678';
  const routes = [
    ['get', '/api/admin/dashboard/stats'],
    ['get', '/api/admin/reports/sales'],
    ['get', '/api/admin/reports/sales/export'],
    ['get', '/api/admin/reports/orders/export'],
    ['get', '/api/admin/inventory'],
    ['get', '/api/admin/products/low-stock'],
    ['get', '/api/admin/users'],
    ['get', `/api/admin/users/${id}`],
    ['patch', `/api/admin/users/${id}/status`],
  ];

  it.each(routes)('%s %s → 401 without a token', async (method, url) => {
    const res = await api()[method](url);
    expect(res.status).toBe(401);
  });

  it.each(routes)('%s %s → 403 for a customer', async (method, url) => {
    const { auth } = await loggedIn();
    const res = await api()[method](url).set('Authorization', auth).send({ isActive: false });
    expect(res.status).toBe(403);
    expect(res.body.message).toBe('Access denied');
  });

  it('401 for a forged token', async () => {
    const res = await api().get('/api/admin/inventory').set('Authorization', 'Bearer abc.def.ghi');
    expect(res.status).toBe(401);
  });
});

/* ------------------------------------------------------------------------------------
 * Dashboard
 * ---------------------------------------------------------------------------------- */
describe('GET /api/admin/dashboard/stats', () => {
  // Known data relative to "now" (the dashboard uses rolling windows)
  async function seedDashboard() {
    const ago = (days) => new Date(Date.now() - days * DAY_MS);
    const ali = await createUser({ name: 'Ali Khan' });
    const sara = await createUser({ name: 'Sara Ahmed' });
    const old = await createUser({ name: 'Old Customer' });
    await User.collection.updateOne({ _id: old._id }, { $set: { createdAt: ago(60) } });

    const cat = await createCategory({ name: 'Audio' });
    const p1 = await createProduct({ category: cat._id, price: 1000, stock: 20 });
    const p2 = await createProduct({ category: cat._id, price: 3000, stock: 3 }); // low
    await createProduct({ category: cat._id, stock: 0 }); // low (and out of stock)
    await createProduct({ category: cat._id, stock: 1, isActive: false }); // hidden: ignored

    const o1 = await orderAt(ali, [{ product: p1, quantity: 2 }], ago(1), 'delivered'); // 2250
    await orderAt(ali, [{ product: p2, quantity: 1 }], ago(2)); // 3250 pending
    await orderAt(sara, [{ product: p1, quantity: 1 }], ago(3), 'cancelled'); // 1250
    const o4 = await orderAt(sara, [{ product: p2, quantity: 2 }], ago(10), 'delivered'); // 6000
    await orderAt(ali, [{ product: p1, quantity: 1 }], ago(40), 'delivered'); // 1250, old
    return { p1, p2, o1, o4, ali };
  }

  it('returns exact numbers for the default 30-day window', async () => {
    const { p1, p2, o1, o4, ali } = await seedDashboard();
    const { auth } = await adminAuth();
    const res = await api().get('/api/admin/dashboard/stats').set('Authorization', auth);

    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.range).toBe('30d');
    expect(d.timezone).toBe('UTC');
    expect(d.revenue).toBe(8250); // delivered only: 2250 + 6000
    expect(d.totalOrders).toBe(4); // the 40-day-old order is outside the window
    expect(d.ordersByStatus).toEqual([
      { status: 'cancelled', count: 1 },
      { status: 'delivered', count: 2 },
      { status: 'pending', count: 1 },
    ]);
    expect(d.totalCustomers).toBe(3); // the admin is not a customer
    expect(d.newCustomers).toBe(2); // "Old Customer" joined 60 days ago
    expect(d.totalProducts).toBe(3); // active only
    expect(d.lowStockCount).toBe(2); // stock 3 and stock 0
    expect(d.revenueSeries).toEqual([
      { date: dayInZone(o4.createdAt, 'UTC'), revenue: 6000, orders: 1 },
      { date: dayInZone(o1.createdAt, 'UTC'), revenue: 2250, orders: 1 },
    ]);
    // Cancelled order lines are not "sold"
    expect(d.topProducts).toEqual([
      expect.objectContaining({ _id: String(p2._id), sold: 3, revenue: 9000, name: p2.name }),
      expect.objectContaining({ _id: String(p1._id), sold: 2, revenue: 2000 }),
    ]);
    expect(d.recentOrders).toHaveLength(5);
    expect(d.recentOrders[0]).toMatchObject({
      orderNumber: o1.orderNumber,
      user: { _id: String(ali._id), name: 'Ali Khan' },
    });
    expect(d.recentOrders[0].user.email).toBeUndefined(); // only the name is populated
  });

  it('range=7d and range=12m change the window and the chart buckets', async () => {
    await seedDashboard();
    const { auth } = await adminAuth();

    const week = await api().get('/api/admin/dashboard/stats?range=7d').set('Authorization', auth);
    expect(week.body.data).toMatchObject({ range: '7d', revenue: 2250, totalOrders: 3 });

    const year = await api().get('/api/admin/dashboard/stats?range=12m').set('Authorization', auth);
    expect(year.body.data).toMatchObject({ range: '12m', revenue: 9500, totalOrders: 5 });
    // 12m buckets are months: "YYYY-MM"
    year.body.data.revenueSeries.forEach((p) => expect(p.date).toMatch(/^\d{4}-\d{2}$/));
    const sum = year.body.data.revenueSeries.reduce((s, p) => s + p.revenue, 0);
    expect(sum).toBe(9500);
  });

  it('returns zeros on an empty shop', async () => {
    const { auth } = await adminAuth();
    const res = await api().get('/api/admin/dashboard/stats').set('Authorization', auth);
    expect(res.body.data).toMatchObject({
      revenue: 0,
      totalOrders: 0,
      ordersByStatus: [],
      totalCustomers: 0,
      revenueSeries: [],
      topProducts: [],
      recentOrders: [],
    });
  });

  it('400 for an unknown range or time zone', async () => {
    const { auth } = await adminAuth();
    const bad = await api().get('/api/admin/dashboard/stats?range=1y').set('Authorization', auth);
    expect(bad.status).toBe(400);
    expect(bad.body.errors[0].field).toBe('range');
    const tz = await api()
      .get('/api/admin/dashboard/stats?tz=Mars/Base')
      .set('Authorization', auth);
    expect(tz.status).toBe(400);
    expect(tz.body.errors[0].field).toBe('tz');
  });
});

/* ------------------------------------------------------------------------------------
 * Sales report + CSV
 * ---------------------------------------------------------------------------------- */
// Fixed calendar dates (January 2026), so the report does not depend on today's date
async function seedSales() {
  const alpha = await createCategory({ name: 'Alpha' });
  const beta = await createCategory({ name: 'Beta' });
  const p1 = await createProduct({ category: alpha._id, price: 1000, name: 'Alpha Lamp' });
  const p2 = await createProduct({ category: beta._id, price: 3000, name: 'Beta Chair' });
  const ali = await createUser({ name: 'Ali Khan', email: 'ali.sales@test.com' });
  const s1 = await orderAt(ali, [{ product: p1, quantity: 2 }], new Date('2026-01-05T10:00:00Z'));
  // 20:30 UTC = 01:30 the NEXT day in Pakistan (UTC+5)
  const s2 = await orderAt(
    ali,
    [{ product: p2, quantity: 1 }],
    new Date('2026-01-05T20:30:00Z'),
    'delivered',
  );
  const s3 = await orderAt(
    ali,
    [{ product: p1, quantity: 1 }],
    new Date('2026-01-20T12:00:00Z'),
    'cancelled',
  );
  await orderAt(ali, [{ product: p2, quantity: 2 }], new Date('2026-02-03T08:00:00Z'), 'confirmed');
  // 31 Dec 21:00 UTC = 1 Jan 02:00 in Pakistan
  await orderAt(ali, [{ product: p1, quantity: 1 }], new Date('2025-12-31T21:00:00Z'), 'delivered');
  return { p1, p2, ali, s1, s2, s3 };
}

describe('GET /api/admin/reports/sales', () => {
  const url = '/api/admin/reports/sales';

  it('groups January by day (UTC), skipping cancelled orders', async () => {
    const { p1, p2 } = await seedSales();
    const { auth } = await adminAuth();
    const res = await api().get(`${url}?from=2026-01-01&to=2026-01-31`).set('Authorization', auth);

    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.from).toBe('2026-01-01T00:00:00.000Z');
    expect(d.to).toBe('2026-01-31T23:59:59.999Z');
    expect(d.groupBy).toBe('day');
    expect(d.rows).toEqual([
      { period: '2026-01-05', orders: 2, itemsSold: 3, revenue: 5500, averageOrderValue: 2750 },
    ]);
    expect(d.totals).toEqual({ orders: 2, itemsSold: 3, revenue: 5500, averageOrderValue: 2750 });
    expect(d.byCategory).toEqual([
      { category: 'Beta', revenue: 3000, itemsSold: 1 },
      { category: 'Alpha', revenue: 2000, itemsSold: 2 },
    ]);
    expect(d.topProducts).toEqual([
      { _id: String(p2._id), name: 'Beta Chair', sold: 1, revenue: 3000 },
      { _id: String(p1._id), name: 'Alpha Lamp', sold: 2, revenue: 2000 },
    ]);
  });

  it('tz=Asia/Karachi moves late-night orders to the local day', async () => {
    await seedSales();
    const { auth } = await adminAuth();
    const res = await api()
      .get(`${url}?from=2026-01-01&to=2026-01-31&tz=Asia/Karachi`)
      .set('Authorization', auth);

    const d = res.body.data;
    expect(d.timezone).toBe('Asia/Karachi');
    expect(d.from).toBe('2025-12-31T19:00:00.000Z'); // local midnight = 19:00 UTC the day before
    expect(d.rows).toEqual([
      { period: '2026-01-01', orders: 1, itemsSold: 1, revenue: 1250, averageOrderValue: 1250 },
      { period: '2026-01-05', orders: 1, itemsSold: 2, revenue: 2250, averageOrderValue: 2250 },
      { period: '2026-01-06', orders: 1, itemsSold: 1, revenue: 3250, averageOrderValue: 3250 },
    ]);
    expect(d.totals).toEqual({ orders: 3, itemsSold: 4, revenue: 6750, averageOrderValue: 2250 });
  });

  it('groupBy=month and groupBy=week (ISO weeks)', async () => {
    await seedSales();
    const { auth } = await adminAuth();
    const month = await api()
      .get(`${url}?from=2026-01-01&to=2026-02-28&groupBy=month`)
      .set('Authorization', auth);
    expect(month.body.data.rows.map((r) => [r.period, r.revenue])).toEqual([
      ['2026-01', 5500],
      ['2026-02', 6000],
    ]);

    const week = await api()
      .get(`${url}?from=2026-01-01&to=2026-02-28&groupBy=week`)
      .set('Authorization', auth);
    expect(week.body.data.rows.map((r) => r.period)).toEqual(['2026-W02', '2026-W06']);
  });

  it('defaults to the last 30 days (nothing in this data set) with zero totals', async () => {
    await seedSales();
    const { auth } = await adminAuth();
    const res = await api().get(url).set('Authorization', auth);
    expect(res.status).toBe(200);
    expect(res.body.data.rows).toEqual([]);
    expect(res.body.data.totals).toEqual({
      orders: 0,
      itemsSold: 0,
      revenue: 0,
      averageOrderValue: 0,
    });
  });

  it('keeps sales of deleted products in an "Uncategorised" row', async () => {
    const { p2 } = await seedSales();
    await p2.deleteOne();
    const { auth } = await adminAuth();
    const res = await api().get(`${url}?from=2026-01-01&to=2026-01-31`).set('Authorization', auth);
    expect(res.body.data.byCategory).toEqual([
      { category: 'Uncategorised', revenue: 3000, itemsSold: 1 },
      { category: 'Alpha', revenue: 2000, itemsSold: 2 },
    ]);
  });

  it.each([
    ['from=2026-02-30', 'from'], // not a real date
    ['from=01-01-2026', 'from'], // wrong shape
    ['to=2026-01-01T10:00', 'to'], // times are not allowed
    ['groupBy=year', 'groupBy'],
    ['tz=Nowhere/City', 'tz'],
  ])('400 for %s', async (qs, field) => {
    const { auth } = await adminAuth();
    const res = await api().get(`${url}?${qs}`).set('Authorization', auth);
    expect(res.status).toBe(400);
    expect(res.body.errors[0].field).toBe(field);
  });

  it('400 when from is after to, or the period is longer than a year', async () => {
    const { auth } = await adminAuth();
    const reversed = await api()
      .get(`${url}?from=2026-02-01&to=2026-01-01`)
      .set('Authorization', auth);
    expect(reversed.status).toBe(400);
    expect(reversed.body.message).toBe('Start date must be before end date');

    const tooLong = await api()
      .get(`${url}?from=2024-01-01&to=2026-01-01`)
      .set('Authorization', auth);
    expect(tooLong.status).toBe(400);
    expect(tooLong.body.message).toBe('Range can be at most one year');
  });
});

describe('GET /api/admin/reports/sales/export (CSV)', () => {
  it('downloads the report as CSV with the right headers and exact content', async () => {
    await seedSales();
    const { auth } = await adminAuth();
    const res = await api()
      .get('/api/admin/reports/sales/export?from=2026-01-01&to=2026-01-31')
      .set('Authorization', auth);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(res.headers['content-disposition']).toBe(
      'attachment; filename="sales-report_2026-01-01_2026-01-31.csv"',
    );
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.text).toBe(
      '﻿' +
        'period,orders,itemsSold,revenue,averageOrderValue\r\n' +
        '2026-01-05,2,3,5500,2750\r\n' +
        'TOTAL,2,3,5500,2750\r\n',
    );
  });

  it('uses the time zone for rows and the file name', async () => {
    await seedSales();
    const { auth } = await adminAuth();
    const res = await api()
      .get('/api/admin/reports/sales/export?from=2026-01-01&to=2026-01-31&tz=Asia/Karachi')
      .set('Authorization', auth);
    expect(res.headers['content-disposition']).toContain('sales-report_2026-01-01_2026-01-31.csv');
    expect(res.text.split('\r\n')).toEqual([
      '﻿period,orders,itemsSold,revenue,averageOrderValue',
      '2026-01-01,1,1,1250,1250',
      '2026-01-05,1,2,2250,2250',
      '2026-01-06,1,1,3250,3250',
      'TOTAL,3,4,6750,2250',
      '',
    ]);
  });

  it('400 (JSON, not CSV) for bad dates', async () => {
    const { auth } = await adminAuth();
    const res = await api()
      .get('/api/admin/reports/sales/export?from=2026-03-01&to=2026-01-01')
      .set('Authorization', auth);
    expect(res.status).toBe(400);
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });
});

describe('GET /api/admin/reports/orders/export (streamed CSV)', () => {
  const url = '/api/admin/reports/orders/export';

  it('streams one line per order (cancelled included), oldest first', async () => {
    const { ali, s1, s2, s3 } = await seedSales();
    const { auth } = await adminAuth();
    const res = await api().get(`${url}?from=2026-01-01&to=2026-01-31`).set('Authorization', auth);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(res.headers['content-disposition']).toBe(
      'attachment; filename="orders_2026-01-01_2026-01-31.csv"',
    );
    expect(res.text.split('\r\n')).toEqual([
      '﻿orderNumber,date,customerName,customerEmail,status,paymentMethod,paymentStatus,items,itemsPrice,discountPrice,shippingPrice,totalPrice',
      `${s1.orderNumber},2026-01-05 10:00,Ali Khan,${ali.email},pending,COD,pending,2,2000,0,250,2250`,
      `${s2.orderNumber},2026-01-05 20:30,Ali Khan,${ali.email},delivered,COD,paid,1,3000,0,250,3250`,
      `${s3.orderNumber},2026-01-20 12:00,Ali Khan,${ali.email},cancelled,COD,pending,1,1000,0,250,1250`,
      '',
    ]);
  });

  it('filters by status and shows local times for tz', async () => {
    const { s2 } = await seedSales();
    const { auth } = await adminAuth();
    const res = await api()
      .get(`${url}?from=2026-01-01&to=2026-01-31&status=delivered&tz=Asia/Karachi`)
      .set('Authorization', auth);
    const lines = res.text.split('\r\n');
    expect(lines).toHaveLength(4); // header + 2 delivered orders + final empty string
    expect(lines[1]).toContain(',2026-01-01 02:00,'); // 31 Dec 21:00 UTC in Pakistan
    expect(lines[2]).toMatch(new RegExp(`^${s2.orderNumber},2026-01-06 01:30,`));
  });

  it('defuses formula injection and quotes awkward names', async () => {
    const product = await createProduct();
    const evil = await createUser({ name: '=HYPERLINK("http://x"), hi' });
    await orderAt(evil, [{ product }], new Date('2026-01-10T09:00:00Z'));
    const { auth } = await adminAuth();
    const res = await api().get(`${url}?from=2026-01-01&to=2026-01-31`).set('Authorization', auth);
    expect(res.text).toContain(`,"'=HYPERLINK(""http://x""), hi",${evil.email},`);
  });

  it('an empty period gives just the header line', async () => {
    const { auth } = await adminAuth();
    const res = await api().get(url).set('Authorization', auth);
    expect(res.status).toBe(200);
    expect(res.text).toBe(
      '﻿orderNumber,date,customerName,customerEmail,status,paymentMethod,paymentStatus,items,itemsPrice,discountPrice,shippingPrice,totalPrice\r\n',
    );
  });

  it('400 for a bad status or reversed dates (before any CSV byte is sent)', async () => {
    const { auth } = await adminAuth();
    const status = await api().get(`${url}?status=lost`).set('Authorization', auth);
    expect(status.status).toBe(400);
    expect(status.body.errors[0].field).toBe('status');
    const reversed = await api()
      .get(`${url}?from=2026-02-01&to=2026-01-01`)
      .set('Authorization', auth);
    expect(reversed.status).toBe(400);
  });

  it('cuts the connection if the database fails half-way (no silently partial file)', async () => {
    const { auth } = await adminAuth();
    // Replace the aggregation with a cursor that fails after the header was sent
    jest.spyOn(Order, 'aggregate').mockReturnValue({
      cursor: () =>
        (async function* failing() {
          yield* [];
          throw new Error('database went away');
        })(),
    });
    await expect(api().get(url).set('Authorization', auth)).rejects.toThrow();
  });
});

/* ------------------------------------------------------------------------------------
 * Inventory & low stock
 * ---------------------------------------------------------------------------------- */
async function seedInventory() {
  const a = await createCategory({ name: 'Kitchen' });
  const b = await createCategory({ name: 'Garden' });
  const p1 = await createProduct({ category: a._id, price: 1000, stock: 20, name: 'Big Pot' });
  const p2 = await createProduct({ category: b._id, price: 3000, stock: 3, name: 'Hose' });
  const p3 = await createProduct({ category: a._id, price: 500, stock: 0, name: 'Cup' });
  await createProduct({ category: a._id, price: 100, stock: 1, isActive: false, name: 'Old' });
  return { a, b, p1, p2, p3 };
}

describe('GET /api/admin/inventory', () => {
  it('returns exact totals and a per-category table ($facet)', async () => {
    const { a, b } = await seedInventory();
    const { auth } = await adminAuth();
    const res = await api().get('/api/admin/inventory').set('Authorization', auth);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      totalProducts: 4,
      activeProducts: 3,
      inactiveProducts: 1,
      totalUnits: 23, // 20 + 3 + 0 (the hidden product is not for sale)
      stockValue: 29000, // 1000×20 + 3000×3 + 500×0
      outOfStockCount: 1,
      lowStockCount: 2,
      lowStockThreshold: 5,
      byCategory: [
        {
          categoryId: String(a._id),
          category: 'Kitchen',
          products: 2,
          units: 20,
          stockValue: 20000,
        },
        { categoryId: String(b._id), category: 'Garden', products: 1, units: 3, stockValue: 9000 },
      ],
    });
  });

  it('returns zeros for an empty catalogue', async () => {
    const { auth } = await adminAuth();
    const res = await api().get('/api/admin/inventory').set('Authorization', auth);
    expect(res.body.data).toMatchObject({
      totalProducts: 0,
      inactiveProducts: 0,
      stockValue: 0,
      byCategory: [],
    });
  });
});

describe('GET /api/admin/products/low-stock', () => {
  const url = '/api/admin/products/low-stock';

  it('lists active products with stock ≤ 5, emptiest first, with their category', async () => {
    const { p2, p3 } = await seedInventory();
    const { auth } = await adminAuth();
    const res = await api().get(url).set('Authorization', auth);
    expect(res.status).toBe(200);
    expect(res.body.data.map((p) => [p._id, p.stock])).toEqual([
      [String(p3._id), 0],
      [String(p2._id), 3],
    ]);
    expect(res.body.data[1].category).toEqual({ _id: String(p2.category), name: 'Garden' });
  });

  it('accepts a custom threshold', async () => {
    await seedInventory();
    const { auth } = await adminAuth();
    const zero = await api().get(`${url}?threshold=0`).set('Authorization', auth);
    expect(zero.body.data.map((p) => p.name)).toEqual(['Cup']);
    const twenty = await api().get(`${url}?threshold=20`).set('Authorization', auth);
    expect(twenty.body.data.map((p) => p.name)).toEqual(['Cup', 'Hose', 'Big Pot']);
  });

  it.each(['-1', 'abc', '1001'])('400 for threshold=%s', async (t) => {
    const { auth } = await adminAuth();
    const res = await api().get(`${url}?threshold=${t}`).set('Authorization', auth);
    expect(res.status).toBe(400);
    expect(res.body.errors[0].field).toBe('threshold');
  });
});

/* ------------------------------------------------------------------------------------
 * Customers
 * ---------------------------------------------------------------------------------- */
async function seedCustomers() {
  const ali = await createUser({ name: 'Ali Khan', email: 'ali.customer@test.com' });
  const sara = await createUser({ name: 'Sara Ahmed', isActive: false });
  const product = await createProduct();
  await orderAt(ali, [{ product, quantity: 2 }], new Date(Date.now() - DAY_MS), 'delivered'); // 2250
  await orderAt(ali, [{ product }], new Date()); // pending: counted, not "spent"
  return { ali, sara };
}

describe('GET /api/admin/users', () => {
  const url = '/api/admin/users';

  it('lists customers only, newest first, with order counts and money spent', async () => {
    const { ali, sara } = await seedCustomers();
    const { auth } = await adminAuth();
    const res = await api().get(url).set('Authorization', auth);

    expect(res.status).toBe(200);
    expect(res.body.meta).toEqual({ page: 1, limit: 20, total: 2, pages: 1 });
    expect(res.body.data.map((u) => u._id)).toEqual([String(sara._id), String(ali._id)]);
    expect(res.body.data[1]).toMatchObject({
      name: 'Ali Khan',
      isActive: true,
      orderCount: 2,
      totalSpent: 2250,
    });
    expect(res.body.data[0]).toMatchObject({ orderCount: 0, totalSpent: 0, isActive: false });
    // Allow-list: no secrets or internals
    expect(Object.keys(res.body.data[0]).sort()).toEqual(
      [
        '_id',
        'authProvider',
        'createdAt',
        'email',
        'isActive',
        'isEmailVerified',
        'name',
        'orderCount',
        'totalSpent',
      ].sort(),
    );
  });

  it('searches name or email, case-insensitive, with regex characters escaped', async () => {
    await seedCustomers();
    const { auth } = await adminAuth();
    const byName = await api().get(`${url}?search=ALI`).set('Authorization', auth);
    expect(byName.body.data.map((u) => u.name)).toEqual(['Ali Khan']);
    const byEmail = await api().get(`${url}?search=customer@test`).set('Authorization', auth);
    expect(byEmail.body.data).toHaveLength(1);
    const regex = await api().get(`${url}?search=.*`).set('Authorization', auth);
    expect(regex.body.data).toEqual([]); // ".*" is plain text, not "match everything"
  });

  it('filters by status and paginates', async () => {
    await seedCustomers();
    const { auth } = await adminAuth();
    const inactive = await api().get(`${url}?status=inactive`).set('Authorization', auth);
    expect(inactive.body.data.map((u) => u.name)).toEqual(['Sara Ahmed']);
    const active = await api().get(`${url}?status=active`).set('Authorization', auth);
    expect(active.body.data.map((u) => u.name)).toEqual(['Ali Khan']);

    const page2 = await api().get(`${url}?limit=1&page=2`).set('Authorization', auth);
    expect(page2.body.meta).toEqual({ page: 2, limit: 1, total: 2, pages: 2 });
    expect(page2.body.data.map((u) => u.name)).toEqual(['Ali Khan']);
  });

  it.each([
    ['limit=0', 'limit'],
    ['limit=101', 'limit'],
    ['page=0', 'page'],
    ['status=banned', 'status'],
    ['search[$ne]=x', 'search'], // an object instead of text (NoSQL-injection attempt)
    [`search=${'a'.repeat(101)}`, 'search'],
  ])('400 for %s', async (qs, field) => {
    const { auth } = await adminAuth();
    const res = await api().get(`${url}?${qs}`).set('Authorization', auth);
    expect(res.status).toBe(400);
    expect(res.body.errors[0].field).toBe(field);
  });
});

describe('GET /api/admin/users/:id', () => {
  it('returns the customer, their orders (newest first) and a summary', async () => {
    const { ali } = await seedCustomers();
    const { auth } = await adminAuth();
    const res = await api().get(`/api/admin/users/${ali._id}`).set('Authorization', auth);

    expect(res.status).toBe(200);
    expect(res.body.data.user).toMatchObject({ _id: String(ali._id), email: ali.email });
    expect(res.body.data.user.password).toBeUndefined();
    expect(res.body.data.orders.map((o) => o.status)).toEqual(['pending', 'delivered']);
    expect(Object.keys(res.body.data.orders[0]).sort()).toEqual(
      [
        '_id',
        'createdAt',
        'orderNumber',
        'paymentMethod',
        'paymentStatus',
        'status',
        'totalPrice',
      ].sort(),
    );
    expect(res.body.data.summary).toEqual({ orderCount: 2, totalSpent: 2250 });
  });

  it('a customer without orders has an empty list and zero summary', async () => {
    const { sara } = await seedCustomers();
    const { auth } = await adminAuth();
    const res = await api().get(`/api/admin/users/${sara._id}`).set('Authorization', auth);
    expect(res.body.data.orders).toEqual([]);
    expect(res.body.data.summary).toEqual({ orderCount: 0, totalSpent: 0 });
  });

  it('404 for an unknown id and for an ADMIN id (customers only)', async () => {
    const { admin, auth } = await adminAuth();
    const other = await createAdmin();
    for (const id of ['665f1c2e9b1e8a0012345678', admin._id, other._id]) {
      const res = await api().get(`/api/admin/users/${id}`).set('Authorization', auth);
      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Customer not found');
    }
  });

  it('400 for a malformed id', async () => {
    const { auth } = await adminAuth();
    const res = await api().get('/api/admin/users/not-an-id').set('Authorization', auth);
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Invalid id');
  });
});

describe('PATCH /api/admin/users/:id/status', () => {
  const setStatus = (auth, id, body) =>
    api().patch(`/api/admin/users/${id}/status`).set('Authorization', auth).send(body);

  it('deactivates a customer, whose existing token is then rejected; reactivating restores it', async () => {
    const { user, auth: customerAuth } = await loggedIn();
    const { auth } = await adminAuth();
    expect((await api().get('/api/auth/me').set('Authorization', customerAuth)).status).toBe(200);

    const off = await setStatus(auth, user._id, { isActive: false });
    expect(off.status).toBe(200);
    expect(off.body.message).toBe('Customer deactivated');
    expect(off.body.data).toMatchObject({ _id: String(user._id), isActive: false });
    expect(off.body.data.password).toBeUndefined();

    // Same token, now refused: protect() reloads the user on every request
    const blocked = await api().get('/api/auth/me').set('Authorization', customerAuth);
    expect(blocked.status).toBe(403);
    expect(blocked.body.message).toBe('Account disabled');

    const on = await setStatus(auth, user._id, { isActive: true });
    expect(on.body.message).toBe('Customer activated');
    expect((await api().get('/api/auth/me').set('Authorization', customerAuth)).status).toBe(200);
  });

  it('400: an admin cannot change their own status', async () => {
    const { admin, auth } = await adminAuth();
    const res = await setStatus(auth, admin._id, { isActive: false });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('You cannot change your own status');
    expect((await User.findById(admin._id)).isActive).toBe(true);
  });

  it('400: another admin cannot be deactivated here', async () => {
    const { auth } = await adminAuth();
    const other = await createAdmin();
    const res = await setStatus(auth, other._id, { isActive: false });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Admin accounts cannot be deactivated here');
    expect((await User.findById(other._id)).isActive).toBe(true);
  });

  it('404 for an unknown customer', async () => {
    const { auth } = await adminAuth();
    const res = await setStatus(auth, '665f1c2e9b1e8a0012345678', { isActive: false });
    expect(res.status).toBe(404);
  });

  it.each([[{}], [{ isActive: 'false' }], [{ isActive: 0 }]])(
    '400 when isActive is not a real boolean: %j',
    async (body) => {
      const { auth } = await adminAuth();
      const customer = await createUser();
      const res = await setStatus(auth, customer._id, body);
      expect(res.status).toBe(400);
      expect(res.body.errors[0].field).toBe('isActive');
    },
  );

  it('400 for a malformed id', async () => {
    const { auth } = await adminAuth();
    const res = await setStatus(auth, 'xyz', { isActive: false });
    expect(res.status).toBe(400);
  });
});
