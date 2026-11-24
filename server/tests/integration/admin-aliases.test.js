/**
 * INTEGRATION tests for the /api/admin/* routes whose handlers live in OTHER modules
 * (re-exported by admin.routes.js so the URLs match the reference client's adminApi.js):
 * categories, products, orders, reviews and coupons. Each route: 401 without a token,
 * 403 for a customer, and the admin's happy path with the module's real behaviour.
 * The deep business rules are tested in each module's own suite.
 */
import { connectTestDB, clearTestDB, closeTestDB } from '../helpers/db.js';
import {
  api,
  bearer,
  createAdmin,
  createUser,
  loggedIn,
  createCategory,
  createProduct,
  createOrder,
  createReview,
  createCoupon,
  uniqueCouponCode,
} from '../helpers/factories.js';
import { Coupon, Order, Review } from '../../src/modules/models.js';

let adminAuth;
let customerAuth;
beforeAll(connectTestDB);
beforeEach(async () => {
  adminAuth = bearer(await createAdmin());
  ({ auth: customerAuth } = await loggedIn());
});
afterEach(clearTestDB);
afterAll(closeTestDB);

const BAD_ID = '665f1c2e9b1e8a0012345678';
const inDays = (n) => new Date(Date.now() + n * 24 * 60 * 60 * 1000).toISOString();
const couponBody = (overrides = {}) => ({
  code: uniqueCouponCode('ADM'),
  type: 'percentage',
  value: 15,
  expiresAt: inDays(30),
  ...overrides,
});

// [method, url, body?] for every re-exported route
const ROUTES = [
  ['get', '/api/admin/categories'],
  ['get', '/api/admin/products'],
  ['get', `/api/admin/products/${BAD_ID}`],
  ['get', '/api/admin/orders'],
  ['patch', `/api/admin/orders/${BAD_ID}/status`, { status: 'confirmed' }],
  ['get', '/api/admin/reviews'],
  ['patch', `/api/admin/reviews/${BAD_ID}/visibility`, { isVisible: false }],
  ['get', '/api/admin/coupons'],
  ['post', '/api/admin/coupons', couponBody()],
  ['put', `/api/admin/coupons/${BAD_ID}`, couponBody()],
  ['delete', `/api/admin/coupons/${BAD_ID}`],
];

describe('guards on every re-exported /api/admin route', () => {
  // Every row gets exactly three arguments (the body wrapped in an object), so Jest never
  // mistakes a missing body for a `done` callback.
  const rows = ROUTES.map(([method, url, body]) => [method, url, { body }]);
  it.each(rows)('%s %s → 401 without a token, 403 for a customer', async (method, url, opts) => {
    expect((await api()[method](url).send(opts.body)).status).toBe(401);
    const res = await api()[method](url).set('Authorization', customerAuth).send(opts.body);
    expect(res.status).toBe(403);
  });
});

describe('catalogue', () => {
  it('GET /api/admin/categories lists inactive categories too, with productCount', async () => {
    const men = await createCategory({ name: 'Men', sortOrder: 1 });
    await createCategory({ name: 'Hidden', sortOrder: 2, isActive: false });
    await createProduct({ category: men._id });
    const res = await api().get('/api/admin/categories').set('Authorization', adminAuth);
    expect(res.status).toBe(200);
    expect(res.body.data.map((c) => [c.name, c.productCount])).toEqual([
      ['Men', 1],
      ['Hidden', 0],
    ]);
  });

  it('GET /api/admin/products lists inactive products with pagination meta', async () => {
    await createProduct({ isActive: false });
    await createProduct();
    const res = await api().get('/api/admin/products?limit=1').set('Authorization', adminAuth);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta).toMatchObject({ page: 1, limit: 1, total: 2, pages: 2 });
  });

  it('GET /api/admin/products/:id returns an inactive product; 404 / 400 for bad ids', async () => {
    const hidden = await createProduct({ isActive: false });
    const get = (id) => api().get(`/api/admin/products/${id}`).set('Authorization', adminAuth);
    const ok = await get(hidden._id);
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({ _id: String(hidden._id), isActive: false });
    expect((await get(BAD_ID)).status).toBe(404);
    expect((await get('abc')).status).toBe(400);
  });

  it('GET /api/admin/products/low-stock is the admin module route (the only one)', async () => {
    await createProduct({ stock: 2 });
    await createProduct({ stock: 50 });
    const res = await api()
      .get('/api/admin/products/low-stock?threshold=3')
      .set('Authorization', adminAuth);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });
});

describe('orders', () => {
  it('GET /api/admin/orders lists every customer order; a bad status filter → 400', async () => {
    await createOrder(await createUser());
    await createOrder(await createUser());
    const list = (query = '') =>
      api().get(`/api/admin/orders${query}`).set('Authorization', adminAuth);
    const res = await list();
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect((await list('?status=lost')).status).toBe(400);
  });

  it('PATCH /api/admin/orders/:id/status follows the state machine', async () => {
    const order = await createOrder(await createUser());
    const move = (status) =>
      api()
        .patch(`/api/admin/orders/${order._id}/status`)
        .set('Authorization', adminAuth)
        .send({ status });
    expect((await move('confirmed')).status).toBe(200);
    expect((await Order.findById(order._id)).status).toBe('confirmed');
    expect((await move('delivered')).status).toBe(400); // confirmed → delivered is not allowed
  });
});

describe('reviews moderation', () => {
  it('GET /api/admin/reviews and PATCH /api/admin/reviews/:id/visibility', async () => {
    const review = await createReview(await createUser(), await createProduct());
    const list = await api().get('/api/admin/reviews').set('Authorization', adminAuth);
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);

    const res = await api()
      .patch(`/api/admin/reviews/${review._id}/visibility`)
      .set('Authorization', adminAuth)
      .send({ isVisible: false });
    expect(res.status).toBe(200);
    expect((await Review.findById(review._id)).isVisible).toBe(false);
  });
});

describe('coupons', () => {
  it('GET, POST, PUT and DELETE /api/admin/coupons', async () => {
    await createCoupon();
    const list = await api().get('/api/admin/coupons').set('Authorization', adminAuth);
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(1);

    const created = await api()
      .post('/api/admin/coupons')
      .set('Authorization', adminAuth)
      .send(couponBody({ code: 'ADMIN15' }));
    expect(created.status).toBe(201);
    const { _id: id } = created.body.data;

    const updated = await api()
      .put(`/api/admin/coupons/${id}`)
      .set('Authorization', adminAuth)
      .send(couponBody({ code: 'ADMIN15', value: 25 }));
    expect(updated.status).toBe(200);
    expect(updated.body.data.value).toBe(25);

    const invalid = await api()
      .post('/api/admin/coupons')
      .set('Authorization', adminAuth)
      .send(couponBody({ value: 95 }));
    expect(invalid.status).toBe(400);

    const removed = await api().delete(`/api/admin/coupons/${id}`).set('Authorization', adminAuth);
    expect(removed.status).toBe(200);
    expect(await Coupon.exists({ _id: id })).toBeNull();
  });
});
