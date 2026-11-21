/**
 * INTEGRATION tests for /api/coupons (discount codes).
 *
 * Key promises:
 *  - admins manage coupons (customers get 403, guests 401); customers preview (admins 403)
 *  - codes are unique and case-insensitive (409 on duplicates, even when typed in lowercase)
 *  - a preview uses the SERVER's cart subtotal and the coupon's rules (window, limits,
 *    minimum order, cap) and never uses the coupon up
 *  - usedCount is never set from the request body, and Coupon.consume never goes over the
 *    usage limit even when many checkouts race for the last use
 *  - a used coupon is only deactivated, never deleted
 */
import mongoose from 'mongoose';
import { connectTestDB, clearTestDB, closeTestDB } from '../helpers/db.js';
import {
  api,
  loggedIn,
  bearer,
  createAdmin,
  createProduct,
  addToCart,
  createCoupon,
  uniqueCouponCode,
} from '../helpers/factories.js';
import { Coupon, Product } from '../../src/modules/models.js';
import { PRICING } from '../../src/config/constants.js';

beforeAll(connectTestDB);
afterEach(clearTestDB);
afterAll(closeTestDB);

const DAY = 24 * 60 * 60 * 1000;
const inDays = (n) => new Date(Date.now() + n * DAY).toISOString();
const missingId = () => new mongoose.Types.ObjectId().toString();

// A complete, valid admin form body. Override what a test cares about.
const validCoupon = (overrides = {}) => ({
  code: uniqueCouponCode('NEW'),
  description: 'Test sale',
  type: 'percentage',
  value: 20,
  maxDiscount: 1000,
  minOrderAmount: 0,
  expiresAt: inDays(30),
  ...overrides,
});

// Short request helpers: each test reads like a sentence
const preview = (auth, code) =>
  api().post('/api/coupons/validate').set('Authorization', auth).send({ code });
const list = (auth) => api().get('/api/coupons').set('Authorization', auth);
const getOne = (auth, id) => api().get(`/api/coupons/${id}`).set('Authorization', auth);
const create = (auth, body = validCoupon()) =>
  api().post('/api/coupons').set('Authorization', auth).send(body);
const update = (auth, id, body = validCoupon()) =>
  api().put(`/api/coupons/${id}`).set('Authorization', auth).send(body);
const remove = (auth, id) => api().delete(`/api/coupons/${id}`).set('Authorization', auth);

// A logged-in admin's Authorization header
const adminAuth = async () => bearer(await createAdmin());

// A customer whose cart holds `quantity` × a product costing `price`
async function customerWithCart(price = 1000, quantity = 4) {
  const customer = await loggedIn();
  const product = await createProduct({ price, stock: 20 });
  await addToCart(customer.user, product, quantity);
  return { ...customer, product };
}

describe('Access control', () => {
  const adminRoutes = [
    ['GET list', (r) => r.get('/api/coupons')],
    ['GET one', (r) => r.get(`/api/coupons/${missingId()}`)],
    ['POST', (r) => r.post('/api/coupons').send(validCoupon())],
    ['PUT', (r) => r.put(`/api/coupons/${missingId()}`).send(validCoupon())],
    ['DELETE', (r) => r.delete(`/api/coupons/${missingId()}`)],
  ];

  it.each([...adminRoutes, ['POST validate', (r) => r.post('/api/coupons/validate')]])(
    '%s returns 401 without a token',
    async (_name, send) => {
      expect((await send(api())).status).toBe(401);
    },
  );

  it.each(adminRoutes)('%s returns 403 for a customer (admins only)', async (_name, send) => {
    const { auth } = await loggedIn();
    const res = await send(api()).set('Authorization', auth);
    expect(res.status).toBe(403);
    expect(res.body.message).toBe('Access denied');
  });

  it('POST validate returns 403 for an admin (customers only)', async () => {
    const coupon = await createCoupon();
    const res = await preview(await adminAuth(), coupon.code);
    expect(res.status).toBe(403);
  });
});

describe('POST /api/coupons (create)', () => {
  it('creates a coupon: code uppercased, creator from the token', async () => {
    const admin = await createAdmin();
    const res = await create(bearer(admin), validCoupon({ code: 'summer26' }));
    expect(res.status).toBe(201);
    expect(res.body.message).toBe('Coupon created');
    expect(res.body.data).toMatchObject({
      code: 'SUMMER26',
      type: 'percentage',
      value: 20,
      maxDiscount: 1000,
      usedCount: 0,
      usageLimit: null,
      isActive: true,
      state: 'active',
      createdBy: String(admin._id),
    });
  });

  it('accepts numbers sent as strings (HTML forms) and a fixed coupon', async () => {
    const res = await create(
      await adminAuth(),
      validCoupon({ type: 'fixed', value: '500', usageLimit: '10', minOrderAmount: '2000' }),
    );
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ value: 500, usageLimit: 10, minOrderAmount: 2000 });
  });

  it('ignores usedCount and createdBy from the body (mass assignment)', async () => {
    const admin = await createAdmin();
    const res = await create(bearer(admin), validCoupon({ usedCount: 99, createdBy: missingId() }));
    expect(res.status).toBe(201);
    expect(res.body.data.usedCount).toBe(0);
    expect(res.body.data.createdBy).toBe(String(admin._id));
  });

  it('returns 400 with a message per field when the form is empty', async () => {
    const res = await create(await adminAuth(), {});
    expect(res.status).toBe(400);
    const fields = res.body.errors.map((e) => e.field);
    expect(fields).toEqual(expect.arrayContaining(['code', 'type', 'value', 'expiresAt']));
  });

  it.each([
    ['a code with symbols', { code: 'EID-25' }, 'code'],
    ['a code that is not text', { code: 12345 }, 'code'],
    ['a percentage over 90', { value: 95 }, 'value'],
    ['a fixed amount over 100,000', { type: 'fixed', value: 100_001 }, 'value'],
    ['a decimal value', { value: 12.5 }, 'value'],
    ['a negative minimum order', { minOrderAmount: -5 }, 'minOrderAmount'],
    ['a usage limit that is not a number', { usageLimit: 'x' }, 'usageLimit'],
    ['an invalid expiry date', { expiresAt: 'tomorrow' }, 'expiresAt'],
    ['an invalid start date', { startsAt: 'soon' }, 'startsAt'],
    ['an expiry before the start', { startsAt: inDays(10), expiresAt: inDays(5) }, 'expiresAt'],
    ['a description that is too long', { description: 'x'.repeat(151) }, 'description'],
    ['isActive that is not boolean', { isActive: 'maybe' }, 'isActive'],
  ])('returns 400 for %s', async (_name, overrides, field) => {
    const res = await create(await adminAuth(), validCoupon(overrides));
    expect(res.status).toBe(400);
    expect(res.body.errors.map((e) => e.field)).toContain(field);
  });

  it('returns 400 (model check) for an expiry already in the past', async () => {
    const res = await create(await adminAuth(), validCoupon({ expiresAt: inDays(-1) }));
    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual([
      { field: 'expiresAt', message: 'Expiry must be after start date' },
    ]);
  });

  it('returns 409 for a duplicate code, whatever its case', async () => {
    const auth = await adminAuth();
    await create(auth, validCoupon({ code: 'DUPE10' }));
    const res = await create(auth, validCoupon({ code: 'dupe10' }));
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Coupon code already exists');
    expect(res.body.errors[0].field).toBe('code');
  });

  it('the unique index stops two identical codes created at the same instant', async () => {
    const auth = await adminAuth();
    const results = await Promise.all([
      create(auth, validCoupon({ code: 'RACE1' })),
      create(auth, validCoupon({ code: 'RACE1' })),
    ]);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([201, 409]);
    expect(await Coupon.countDocuments({ code: 'RACE1' })).toBe(1);
  });
});

describe('GET /api/coupons and /api/coupons/:id', () => {
  it('lists every coupon newest first, with its state', async () => {
    const auth = await adminAuth();
    const older = await createCoupon({ isActive: false });
    const newer = await createCoupon();
    const res = await list(auth);
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Coupons fetched');
    expect(res.body.data.map((c) => c._id)).toEqual([String(newer._id), String(older._id)]);
    expect(res.body.data.map((c) => c.state)).toEqual(['active', 'disabled']);
  });

  it('returns an empty list when there are no coupons', async () => {
    const res = await list(await adminAuth());
    expect(res.body.data).toEqual([]);
  });

  it('returns one coupon', async () => {
    const coupon = await createCoupon({ code: 'ONE10' });
    const res = await getOne(await adminAuth(), coupon._id);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ _id: String(coupon._id), code: 'ONE10' });
  });

  it('returns 404 for an unknown id and 400 for a malformed id', async () => {
    const auth = await adminAuth();
    expect((await getOne(auth, missingId())).status).toBe(404);
    const bad = await getOne(auth, 'abc');
    expect(bad.status).toBe(400);
    expect(bad.body.message).toBe('Invalid id');
  });
});

describe('PUT /api/coupons/:id (replace)', () => {
  it('replaces the settings and keeps usedCount', async () => {
    const coupon = await createCoupon({ code: 'OLD10', usedCount: 3 });
    const res = await update(
      await adminAuth(),
      coupon._id,
      validCoupon({ code: 'new20', type: 'fixed', value: 700, usedCount: 0, isActive: false }),
    );
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Coupon updated');
    expect(res.body.data).toMatchObject({
      code: 'NEW20',
      type: 'fixed',
      value: 700,
      isActive: false,
      usedCount: 3, // never changed from the body
    });
  });

  it('keeping its OWN code is not a conflict', async () => {
    const coupon = await createCoupon({ code: 'SAME10' });
    const res = await update(await adminAuth(), coupon._id, validCoupon({ code: 'same10' }));
    expect(res.status).toBe(200);
  });

  it('empty optional fields remove the cap and the usage limit', async () => {
    const coupon = await createCoupon({ maxDiscount: 500, usageLimit: 5 });
    const res = await update(
      await adminAuth(),
      coupon._id,
      validCoupon({ code: coupon.code, maxDiscount: '', usageLimit: null }),
    );
    expect(res.status).toBe(200);
    expect(res.body.data.maxDiscount).toBeUndefined();
    expect(res.body.data.usageLimit).toBeNull();
  });

  it('returns 409 when the new code belongs to another coupon', async () => {
    await createCoupon({ code: 'TAKEN1' });
    const coupon = await createCoupon();
    const res = await update(await adminAuth(), coupon._id, validCoupon({ code: 'TAKEN1' }));
    expect(res.status).toBe(409);
  });

  it('returns 400 for bad input or a malformed id, 404 for an unknown id', async () => {
    const auth = await adminAuth();
    const coupon = await createCoupon();
    expect((await update(auth, coupon._id, validCoupon({ type: 'free' }))).status).toBe(400);
    expect((await update(auth, 'abc')).status).toBe(400);
    expect((await update(auth, missingId())).status).toBe(404);
  });
});

describe('DELETE /api/coupons/:id', () => {
  it('deletes a coupon that was never used', async () => {
    const coupon = await createCoupon();
    const res = await remove(await adminAuth(), coupon._id);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ message: 'Coupon deleted', data: { deactivated: false } });
    expect(await Coupon.exists({ _id: coupon._id })).toBeNull();
  });

  it('only DEACTIVATES a coupon that was already used (order history keeps it)', async () => {
    const coupon = await createCoupon({ usedCount: 1 });
    const res = await remove(await adminAuth(), coupon._id);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      message: 'Coupon was already used, so it was deactivated',
      data: { deactivated: true },
    });
    const saved = await Coupon.findById(coupon._id);
    expect(saved.isActive).toBe(false);
  });

  it('returns 404 for an unknown id and 400 for a malformed id', async () => {
    const auth = await adminAuth();
    expect((await remove(auth, missingId())).status).toBe(404);
    expect((await remove(auth, 'abc')).status).toBe(400);
  });
});

describe('POST /api/coupons/validate (apply a coupon to my cart)', () => {
  it('applies a percentage coupon to the server-side cart subtotal', async () => {
    const { auth } = await customerWithCart(1000, 4); // subtotal Rs 4,000
    const coupon = await createCoupon({ value: 10, description: 'Ten off' });
    const res = await preview(auth, coupon.code);
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Coupon applied');
    expect(res.body.data).toEqual({
      code: coupon.code,
      type: 'percentage',
      value: 10,
      description: 'Ten off',
      itemsPrice: 4000,
      discountPrice: 400,
      shippingPrice: PRICING.SHIPPING_FEE,
      taxPrice: 0,
      totalPrice: 3600 + PRICING.SHIPPING_FEE,
    });
  });

  it('finds the code whatever the case and spaces the customer types', async () => {
    const { auth } = await customerWithCart();
    await createCoupon({ code: 'EID25' });
    const res = await preview(auth, '  eid25 ');
    expect(res.status).toBe(200);
    expect(res.body.data.code).toBe('EID25');
  });

  it('caps a percentage discount at maxDiscount', async () => {
    const { auth } = await customerWithCart(5000, 2); // Rs 10,000
    const coupon = await createCoupon({ value: 50, maxDiscount: 1500 });
    const res = await preview(auth, coupon.code);
    expect(res.body.data).toMatchObject({ discountPrice: 1500, totalPrice: 8500 });
  });

  it('a fixed coupon bigger than the cart only takes the cart to zero', async () => {
    const { auth } = await customerWithCart(300, 1);
    const coupon = await createCoupon({ type: 'fixed', value: 1000 });
    const res = await preview(auth, coupon.code);
    expect(res.body.data).toMatchObject({ itemsPrice: 300, discountPrice: 300, totalPrice: 0 });
  });

  it('a discount can bring the cart below free shipping again', async () => {
    const { auth } = await customerWithCart(1300, 4); // Rs 5,200 → free shipping alone
    const coupon = await createCoupon({ type: 'fixed', value: 500 });
    const res = await preview(auth, coupon.code);
    expect(res.body.data).toMatchObject({
      discountPrice: 500,
      shippingPrice: PRICING.SHIPPING_FEE,
      totalPrice: 4700 + PRICING.SHIPPING_FEE,
    });
  });

  it('only counts available items (an out-of-stock line is ignored)', async () => {
    const { auth, user } = await customerWithCart(1000, 2); // Rs 2,000 available
    const soldOut = await createProduct({ price: 9000, stock: 0 });
    await addToCart(user, soldOut, 1);
    const coupon = await createCoupon({ minOrderAmount: 3000 });
    const res = await preview(auth, coupon.code);
    expect(res.status).toBe(400); // the Rs 9,000 item does not count towards the minimum
    expect(res.body.message).toBe('Minimum order is Rs 3,000');
  });

  it('works with a cart filled through the cart API', async () => {
    const { auth } = await loggedIn();
    const product = await createProduct({ price: 2500 });
    const added = await api()
      .post('/api/cart/items')
      .set('Authorization', auth)
      .send({ productId: String(product._id), quantity: 2 });
    expect(added.status).toBe(200);
    const coupon = await createCoupon({ value: 20 });
    const res = await preview(auth, coupon.code);
    expect(res.body.data).toMatchObject({ itemsPrice: 5000, discountPrice: 1000 });
  });

  it('a preview does NOT use the coupon up', async () => {
    const { auth } = await customerWithCart();
    const coupon = await createCoupon({ usageLimit: 1 });
    await preview(auth, coupon.code);
    await preview(auth, coupon.code);
    expect((await Coupon.findById(coupon._id)).usedCount).toBe(0);
  });

  it('returns 400 when no code is sent', async () => {
    const { auth } = await customerWithCart();
    const res = await preview(auth, undefined);
    expect(res.status).toBe(400);
    expect(res.body.errors[0]).toEqual({ field: 'code', message: 'Enter a coupon code' });
    expect((await preview(auth, '   ')).status).toBe(400);
    expect((await preview(auth, 'X'.repeat(21))).status).toBe(400);
  });

  it('returns 404 for an unknown code', async () => {
    const { auth } = await customerWithCart();
    const res = await preview(auth, 'NOPE99');
    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Coupon not found');
  });

  it('returns 400 when my cart is empty', async () => {
    const { auth } = await loggedIn();
    const coupon = await createCoupon();
    const res = await preview(auth, coupon.code);
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Your cart is empty');
  });

  it('returns 400 when nothing in my cart can be bought', async () => {
    const { auth, product } = await customerWithCart();
    await Product.updateOne({ _id: product._id }, { isActive: false });
    const coupon = await createCoupon();
    const res = await preview(auth, coupon.code);
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Your cart has no items that can be bought');
  });

  it.each([
    ['disabled', { isActive: false }, 'Coupon is not active'],
    [
      'not active yet',
      { startsAt: new Date(Date.now() + DAY), expiresAt: new Date(Date.now() + 2 * DAY) },
      'Coupon is not active yet',
    ],
    [
      'expired',
      { startsAt: new Date(Date.now() - 2 * DAY), expiresAt: new Date(Date.now() - DAY) },
      'Coupon expired',
    ],
    ['used up', { usageLimit: 2, usedCount: 2 }, 'Coupon usage limit reached'],
    ['below the minimum order', { minOrderAmount: 5000 }, 'Minimum order is Rs 5,000'],
  ])('returns 400 for a coupon that is %s', async (_name, overrides, message) => {
    const { auth } = await customerWithCart(1000, 4); // Rs 4,000
    const coupon = await createCoupon(overrides);
    const res = await preview(auth, coupon.code);
    expect(res.status).toBe(400);
    expect(res.body.message).toBe(message);
  });
});

describe('Coupon.consume / Coupon.release (atomic usage counter for checkout)', () => {
  it('never goes over the usage limit when many checkouts race for the last use', async () => {
    const coupon = await createCoupon({ usageLimit: 1 });
    // 10 "customers" try to use the single remaining use at the same moment
    const results = await Promise.all(Array.from({ length: 10 }, () => Coupon.consume(coupon._id)));
    expect(results.filter(Boolean)).toHaveLength(1); // exactly ONE winner
    expect((await Coupon.findById(coupon._id)).usedCount).toBe(1);
  });

  it('counts every use of an unlimited coupon', async () => {
    const coupon = await createCoupon();
    await Promise.all(Array.from({ length: 5 }, () => Coupon.consume(coupon._id)));
    expect((await Coupon.findById(coupon._id)).usedCount).toBe(5);
  });

  it('refuses a disabled coupon', async () => {
    const coupon = await createCoupon({ isActive: false });
    expect(await Coupon.consume(coupon._id)).toBe(false);
  });

  it('release gives a use back but never goes below zero', async () => {
    const coupon = await createCoupon({ usageLimit: 1 });
    await Coupon.consume(coupon._id);
    await Coupon.release(coupon._id);
    await Coupon.release(coupon._id); // a second release has nothing to give back
    expect((await Coupon.findById(coupon._id)).usedCount).toBe(0);
    expect(await Coupon.consume(coupon._id)).toBe(true); // usable again
  });
});
