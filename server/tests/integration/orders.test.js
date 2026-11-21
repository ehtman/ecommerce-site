/**
 * INTEGRATION tests for /api/orders (customers) and /api/admin/orders (admins).
 *
 * Key promises:
 *  - access: 401 without a token, 403 for the wrong role, 403 for an UNVERIFIED customer
 *  - OWNERSHIP: another customer's order (or address) is invisible → 404 (no IDOR)
 *  - checkout is server-calculated: snapshot prices, shipping, coupon discount, totals
 *  - checkout is all-or-nothing: out of stock / bad coupon → NOTHING changes
 *  - the state machine (BR-08) and the customer cancel rule (BR-06)
 *  - cancelling gives back stock AND the coupon use, exactly once
 *  - emails: confirmation after placing, status mails after changes
 * Concurrency (two buyers, last unit) and forced rollbacks live in orders.transaction.test.js.
 */
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { jest } from '@jest/globals';
import { connectTestDB, clearTestDB, closeTestDB } from '../helpers/db.js';
import {
  api,
  loggedIn,
  bearer,
  createAdmin,
  createUser,
  createAddress,
  createProduct,
  createCoupon,
  addToCart,
  createOrder,
  deliverOrder,
} from '../helpers/factories.js';
import { Order, Product, Cart, Coupon, Address, User } from '../../src/modules/models.js';
import { outbox } from '../../src/emails/sendEmail.js';
import env from '../../src/config/env.js';

beforeAll(connectTestDB);
afterEach(clearTestDB);
afterAll(closeTestDB);

/* ---------- Short request helpers: each test reads like a sentence ---------- */
const place = (auth, body) => api().post('/api/orders').set('Authorization', auth).send(body);
const myOrders = (auth, query = '') =>
  api().get(`/api/orders/my${query}`).set('Authorization', auth);
const getOne = (auth, id) => api().get(`/api/orders/${id}`).set('Authorization', auth);
const cancel = (auth, id, body = {}) =>
  api().patch(`/api/orders/${id}/cancel`).set('Authorization', auth).send(body);
const adminList = (auth, query = '') =>
  api().get(`/api/admin/orders${query}`).set('Authorization', auth);
const setStatus = (auth, id, body) =>
  api().patch(`/api/admin/orders/${id}/status`).set('Authorization', auth).send(body);

const missingId = () => new mongoose.Types.ObjectId().toString();
const stockOf = async (product) => (await Product.findById(product._id)).stock;
const cartOf = (user) => Cart.findOne({ user: user._id });
const mailsTo = (email) => outbox.filter((m) => m.to === email);

/**
 * A verified customer with a default address and `quantity` of one product in the cart.
 * Returns everything a test may want to look at afterwards.
 */
async function readyCustomer({ stock = 20, price = 1000, quantity = 2, user: userOverrides } = {}) {
  const { user, auth } = await loggedIn(userOverrides);
  const address = await createAddress(user, { isDefault: true });
  const product = await createProduct({ stock, price });
  await addToCart(user, product, quantity);
  return { user, auth, address, product, body: { addressId: address._id.toString() } };
}

/* ====================================================================================
 * Access control
 * ==================================================================================== */
describe('Access control', () => {
  const customerRoutes = [
    ['POST /orders', (r) => r.post('/api/orders').send({ addressId: missingId() })],
    ['GET /orders/my', (r) => r.get('/api/orders/my')],
    ['PATCH /orders/:id/cancel', (r) => r.patch(`/api/orders/${missingId()}/cancel`)],
  ];
  const adminRoutes = [
    ['GET /admin/orders', (r) => r.get('/api/admin/orders')],
    [
      'PATCH /admin/orders/:id/status',
      (r) => r.patch(`/api/admin/orders/${missingId()}/status`).send({ status: 'confirmed' }),
    ],
  ];
  const all = [
    ...customerRoutes,
    ['GET /orders/:id', (r) => r.get(`/api/orders/${missingId()}`)],
    ...adminRoutes,
  ];

  it.each(all)('%s returns 401 without a token', async (_name, send) => {
    const res = await send(api());
    expect(res.status).toBe(401);
  });

  it.each(customerRoutes)('%s returns 403 for an admin (customers only)', async (_n, send) => {
    const admin = await createAdmin();
    const res = await send(api()).set('Authorization', bearer(admin));
    expect(res.status).toBe(403);
    expect(res.body.message).toBe('Access denied');
  });

  it.each(adminRoutes)('%s returns 403 for a customer (admins only)', async (_n, send) => {
    const { auth } = await loggedIn();
    const res = await send(api()).set('Authorization', auth);
    expect(res.status).toBe(403);
  });

  it('refuses to place an order for an UNVERIFIED customer (BR-12)', async () => {
    const { auth, body, product } = await readyCustomer({ user: { isEmailVerified: false } });
    const res = await place(auth, body);
    expect(res.status).toBe(403);
    expect(res.body.message).toBe('Please verify your email address to continue');
    expect(await stockOf(product)).toBe(20); // nothing happened
  });

  it('lets an unverified customer still read their order list', async () => {
    const { auth } = await loggedIn({ isEmailVerified: false });
    expect((await myOrders(auth)).status).toBe(200);
  });
});

/* ====================================================================================
 * POST /api/orders – place an order
 * ==================================================================================== */
describe('POST /api/orders (checkout)', () => {
  it('places a COD order: snapshot, server totals, stock taken, cart emptied, email sent', async () => {
    const { user, auth, body, product, address } = await readyCustomer({ price: 1500 });
    const res = await place(auth, { ...body, note: '  Call before coming  ' });

    expect(res.status).toBe(201);
    expect(res.body.message).toBe('Order placed successfully');
    const order = res.body.data;
    expect(order.orderNumber).toMatch(/^ORD-\d{8}-\d{5}$/);
    expect(order).toMatchObject({
      user: user._id.toString(),
      status: 'pending',
      paymentMethod: 'COD', // the default
      paymentStatus: 'pending',
      itemsPrice: 3000,
      discountPrice: 0,
      shippingPrice: 250, // under Rs 5,000 → shipping is charged (BR-02)
      taxPrice: 0,
      totalPrice: 3250,
      note: 'Call before coming', // trimmed
    });
    // The item is a SNAPSHOT of the product at this moment
    expect(order.items).toEqual([
      {
        product: product._id.toString(),
        name: product.name,
        slug: product.slug,
        sku: product.sku,
        image: product.images[0].url,
        price: 1500,
        quantity: 2,
        subtotal: 3000,
      },
    ]);
    // …and so is the address (without its id, owner or label)
    expect(order.shippingAddress).toEqual({ ...address.toSnapshot(), addressLine2: undefined });
    expect(order.statusHistory).toHaveLength(1);
    expect(order.statusHistory[0]).toMatchObject({ status: 'pending', note: 'Order placed' });

    // Side effects in the database
    const fresh = await Product.findById(product._id);
    expect(fresh.stock).toBe(18);
    expect(fresh.sold).toBe(2);
    expect((await cartOf(user)).items).toHaveLength(0);
    expect(await Order.countDocuments()).toBe(1);

    // Confirmation email
    const mails = mailsTo(user.email);
    expect(mails).toHaveLength(1);
    expect(mails[0].subject).toBe(`Order ${order.orderNumber} confirmed`);
    expect(mails[0].text).toContain('Total Rs 3,250');
  });

  it('ignores prices, totals, user and status sent by the client', async () => {
    const { auth, body } = await readyCustomer();
    const other = await createUser();
    const res = await place(auth, {
      ...body,
      totalPrice: 1,
      itemsPrice: 1,
      status: 'delivered',
      paymentStatus: 'paid',
      user: other._id.toString(),
      items: [{ price: 1 }],
    });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      totalPrice: 2250,
      status: 'pending',
      paymentStatus: 'pending',
    });
    expect(res.body.data.user).not.toBe(other._id.toString());
  });

  it('gives free shipping from Rs 5,000', async () => {
    const { auth, body } = await readyCustomer({ price: 2500, quantity: 2 });
    const res = await place(auth, body);
    expect(res.body.data).toMatchObject({ itemsPrice: 5000, shippingPrice: 0, totalPrice: 5000 });
  });

  it('keeps the order unchanged when the product and address change later (snapshot)', async () => {
    const { auth, body, product, address } = await readyCustomer();
    const { body: placed } = await place(auth, body);

    await Product.updateOne({ _id: product._id }, { price: 9999, name: 'Renamed product' });
    await Address.updateOne({ _id: address._id }, { city: 'Karachi' });

    const res = await getOne(auth, placed.data._id);
    expect(res.body.data.items[0]).toMatchObject({ name: product.name, price: 1000 });
    expect(res.body.data.shippingAddress.city).toBe('Lahore');
  });

  it.each([
    [{}, 'addressId', 'Please choose a shipping address'],
    [{ addressId: 'nope' }, 'addressId', 'Please choose a shipping address'],
    [{ paymentMethod: 'BITCOIN' }, 'paymentMethod', 'Invalid payment method'],
    [{ couponCode: 123 }, 'couponCode', 'Coupon code must be text'],
    [{ couponCode: 'X'.repeat(21) }, 'couponCode', 'Coupon code must be at most 20 characters'],
    [{ note: 'x'.repeat(301) }, 'note', 'Note must be at most 300 characters'],
    [{ note: 5 }, 'note', 'Note must be text'],
  ])('returns 400 for invalid input %j', async (patch, field, message) => {
    const { auth, body } = await readyCustomer();
    // An empty patch means "send no addressId at all"
    const res = await place(auth, Object.keys(patch).length ? { ...body, ...patch } : {});
    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual(expect.arrayContaining([{ field, message }]));
  });

  it("returns 404 for another customer's address (ownership)", async () => {
    const { auth, product } = await readyCustomer();
    const stranger = await createUser();
    const theirs = await createAddress(stranger);
    const res = await place(auth, { addressId: theirs._id.toString() });
    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Address not found');
    expect(await stockOf(product)).toBe(20);
  });

  it('refuses CARD while card payments are disabled (branch 08)', async () => {
    const { auth, body, product } = await readyCustomer();
    const res = await place(auth, { ...body, paymentMethod: 'CARD' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Card payments are not available right now');
    expect(await stockOf(product)).toBe(20);
  });

  it('accepts CARD when the flag is on, without a confirmation email yet', async () => {
    const { user, auth, body } = await readyCustomer();
    env.PAYMENT_CARD_ENABLED = true; // Branch 08 turns this on with Stripe
    try {
      const res = await place(auth, { ...body, paymentMethod: 'CARD' });
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({ paymentMethod: 'CARD', paymentStatus: 'pending' });
      expect(mailsTo(user.email)).toHaveLength(0); // sent after Stripe confirms (branch 08)
    } finally {
      env.PAYMENT_CARD_ENABLED = false;
    }
  });

  it('returns 400 for an empty cart (no cart at all, or an emptied one)', async () => {
    const { user, auth } = await loggedIn();
    const address = await createAddress(user);
    const body = { addressId: address._id.toString() };
    let res = await place(auth, body);
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Your cart is empty');

    await Cart.create({ user: user._id, items: [] });
    res = await place(auth, body);
    expect(res.status).toBe(400);
  });

  it('cannot place the same cart twice (the second click finds an empty cart)', async () => {
    const { auth, body, product } = await readyCustomer();
    expect((await place(auth, body)).status).toBe(201);
    const again = await place(auth, body);
    expect(again.status).toBe(400);
    expect(again.body.message).toBe('Your cart is empty');
    expect(await stockOf(product)).toBe(18); // taken only once
  });

  it('returns 409 when there is not enough stock, and changes nothing', async () => {
    const { user, auth, body, product } = await readyCustomer({ stock: 1, quantity: 2 });
    const res = await place(auth, body);
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Some items in your cart are unavailable');
    expect(res.body.errors).toEqual([
      {
        product: product._id.toString(),
        name: product.name,
        reason: 'Only 1 left in stock',
        available: 1,
      },
    ]);
    expect(await stockOf(product)).toBe(1);
    expect((await cartOf(user)).items).toHaveLength(1); // the cart is kept
    expect(await Order.countDocuments()).toBe(0);
    expect(outbox).toHaveLength(0);
  });

  it('rolls back the stock of the GOOD lines when another line fails', async () => {
    const { user, auth, body, product } = await readyCustomer({ stock: 10, quantity: 3 });
    const scarce = await createProduct({ stock: 0 });
    await addToCart(user, scarce, 1);

    const res = await place(auth, body);
    expect(res.status).toBe(409);
    expect(res.body.errors).toHaveLength(1);
    expect(res.body.errors[0].name).toBe(scarce.name);
    // The first line WAS reserved inside the transaction, then undone by the abort
    expect(await stockOf(product)).toBe(10);
    expect((await Product.findById(product._id)).sold).toBe(0);
  });

  it('returns 409 for an inactive or deleted product', async () => {
    const { user, auth, body, product } = await readyCustomer();
    const gone = await createProduct();
    await addToCart(user, gone, 1);
    await Product.updateOne({ _id: product._id }, { isActive: false });
    await Product.deleteOne({ _id: gone._id });

    const res = await place(auth, body);
    expect(res.status).toBe(409);
    expect(res.body.errors).toHaveLength(2);
    res.body.errors.forEach((e) => expect(e.reason).toBe('This product is no longer available'));
  });

  it('returns 409 for more than the maximum quantity of one product (BR-04)', async () => {
    const { user, auth, body, product } = await readyCustomer();
    // The cart model refuses 11, so we write it straight into the collection
    await Cart.collection.updateOne({ user: user._id }, { $set: { 'items.0.quantity': 11 } });
    const res = await place(auth, body);
    expect(res.status).toBe(409);
    expect(res.body.errors[0].reason).toBe('You can buy at most 10 of one product');
    expect(await stockOf(product)).toBe(20);
  });

  it('retries once when the random order number is already taken', async () => {
    const { auth, body } = await readyCustomer();
    const first = await createOrder(await createUser());
    // The order number ends with crypto.randomInt(). Make the next one return the SAME
    // digits as the existing order, so MongoDB's unique index refuses it (error 11000).
    const digits = Number(first.orderNumber.slice(-5));
    const spy = jest.spyOn(crypto, 'randomInt').mockReturnValueOnce(digits);
    try {
      const res = await place(auth, body);
      expect(res.status).toBe(201);
      expect(spy).toHaveBeenCalled();
      expect(res.body.data.orderNumber).not.toBe(first.orderNumber);
      expect(await Order.countDocuments()).toBe(2);
    } finally {
      spy.mockRestore();
    }
  });
});

/* ====================================================================================
 * Coupons at checkout
 * ==================================================================================== */
describe('Coupons at checkout', () => {
  it('applies a coupon: discount, snapshot and one use counted', async () => {
    const { auth, body } = await readyCustomer({ price: 1000, quantity: 2 });
    const coupon = await createCoupon({ code: 'SAVE10', type: 'percentage', value: 10 });
    const res = await place(auth, { ...body, couponCode: ' save10 ' }); // case/space tolerant

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      itemsPrice: 2000,
      discountPrice: 200,
      shippingPrice: 250,
      totalPrice: 2050,
      coupon: {
        coupon: coupon._id.toString(),
        code: 'SAVE10',
        type: 'percentage',
        value: 10,
        discount: 200,
      },
    });
    expect((await Coupon.findById(coupon._id)).usedCount).toBe(1);
  });

  it('applies a fixed coupon', async () => {
    const { auth, body } = await readyCustomer({ price: 3000, quantity: 2 });
    await createCoupon({ code: 'FLAT500', type: 'fixed', value: 500 });
    const res = await place(auth, { ...body, couponCode: 'FLAT500' });
    expect(res.body.data).toMatchObject({ discountPrice: 500, shippingPrice: 0, totalPrice: 5500 });
  });

  it.each([
    ['unknown', {}, 'NOPE1', 'Coupon not found'],
    [
      'expired',
      { startsAt: new Date(Date.now() - 2e9), expiresAt: new Date(Date.now() - 1e9) },
      'OLD1',
      'Coupon expired',
    ],
    ['inactive', { isActive: false }, 'OFF1', 'Coupon is not active'],
    ['used up', { usageLimit: 1, usedCount: 1 }, 'ONCE1', 'Coupon usage limit reached'],
    ['under minimum', { minOrderAmount: 50000 }, 'BIG1', 'Minimum order is Rs 50,000'],
  ])('refuses an %s coupon with 400 and changes nothing', async (_n, fields, code, message) => {
    const { user, auth, body, product } = await readyCustomer();
    if (code !== 'NOPE1') await createCoupon({ code, ...fields });
    const res = await place(auth, { ...body, couponCode: code });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe(message);
    // Stock had already been reserved inside the transaction → rolled back
    expect(await stockOf(product)).toBe(20);
    expect((await cartOf(user)).items).toHaveLength(1);
    expect(await Order.countDocuments()).toBe(0);
  });

  it('gives the coupon use back when the order is cancelled', async () => {
    const { auth, body } = await readyCustomer();
    const coupon = await createCoupon({ code: 'BACK10', usageLimit: 1 });
    const { body: placed } = await place(auth, { ...body, couponCode: 'BACK10' });
    expect((await Coupon.findById(coupon._id)).usedCount).toBe(1);

    const res = await cancel(auth, placed.data._id);
    expect(res.status).toBe(200);
    expect((await Coupon.findById(coupon._id)).usedCount).toBe(0); // usable again
  });
});

/* ====================================================================================
 * GET /api/orders/my and GET /api/orders/:id
 * ==================================================================================== */
describe('GET /api/orders/my', () => {
  it('lists ONLY my orders, newest first, with pagination meta', async () => {
    const { user, auth } = await loggedIn();
    const older = await createOrder(user);
    const newer = await createOrder(user);
    await createOrder(await createUser()); // someone else's

    const res = await myOrders(auth);
    expect(res.status).toBe(200);
    expect(res.body.data.map((o) => o._id)).toEqual([newer.id, older.id]);
    expect(res.body.meta).toEqual({ page: 1, limit: 10, total: 2, pages: 1 });
    // A summary only: no address or history in the list
    expect(res.body.data[0].shippingAddress).toBeUndefined();
  });

  it('paginates and filters by status', async () => {
    const { user, auth } = await loggedIn();
    await createOrder(user);
    await createOrder(user);
    await createOrder(user, { status: 'confirmed' });

    const page = await myOrders(auth, '?page=2&limit=2');
    expect(page.body.meta).toEqual({ page: 2, limit: 2, total: 3, pages: 2 });
    expect(page.body.data).toHaveLength(1);

    const confirmed = await myOrders(auth, '?status=confirmed');
    expect(confirmed.body.data).toHaveLength(1);
    expect((await myOrders(auth, '?status=')).body.data).toHaveLength(3); // empty = all
  });

  it('returns 400 for an unknown status filter', async () => {
    const { auth } = await loggedIn();
    const res = await myOrders(auth, '?status=lost');
    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual([{ field: 'status', message: 'Invalid status filter' }]);
  });
});

describe('GET /api/orders/:id', () => {
  it('returns my order with customer details and history', async () => {
    const { user, auth } = await loggedIn();
    const order = await createOrder(user);
    const res = await getOne(auth, order.id);
    expect(res.status).toBe(200);
    expect(res.body.data.user).toMatchObject({ name: user.name, email: user.email });
    expect(res.body.data.user.password).toBeUndefined();
    expect(res.body.data.statusHistory[0].changedBy).toMatchObject({ name: user.name });
  });

  it("returns 404 for another customer's order (no IDOR)", async () => {
    const { auth } = await loggedIn();
    const order = await createOrder(await createUser());
    const res = await getOne(auth, order.id);
    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Order not found');
  });

  it('lets an admin read any order', async () => {
    const order = await createOrder(await createUser());
    const res = await getOne(bearer(await createAdmin()), order.id);
    expect(res.status).toBe(200);
    expect(res.body.data._id).toBe(order.id);
  });

  it('returns 404 for a missing order and 400 for a malformed id', async () => {
    const { auth } = await loggedIn();
    expect((await getOne(auth, missingId())).status).toBe(404);
    const bad = await getOne(auth, 'abc');
    expect(bad.status).toBe(400);
    expect(bad.body.message).toBe('Invalid id');
  });
});

/* ====================================================================================
 * PATCH /api/orders/:id/cancel (BR-06)
 * ==================================================================================== */
describe('PATCH /api/orders/:id/cancel', () => {
  it('cancels a pending order, restores stock and emails the customer', async () => {
    const { user, auth, body, product } = await readyCustomer();
    const { body: placed } = await place(auth, body);
    expect(await stockOf(product)).toBe(18);

    const res = await cancel(auth, placed.data._id, { reason: '  Ordered by mistake ' });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Order cancelled');
    expect(res.body.data).toMatchObject({
      status: 'cancelled',
      cancelReason: 'Ordered by mistake',
    });
    expect(res.body.data.cancelledAt).toBeDefined();
    expect(res.body.data.statusHistory.at(-1)).toMatchObject({
      status: 'cancelled',
      changedBy: user._id.toString(),
    });

    const fresh = await Product.findById(product._id);
    expect(fresh.stock).toBe(20); // BR-05: back on the shelf
    expect(fresh.sold).toBe(0);
    const mails = mailsTo(user.email);
    expect(mails.at(-1).subject).toBe(`Order ${placed.data.orderNumber} has been cancelled`);
  });

  it('cancels a confirmed order with the default reason', async () => {
    const { user, auth } = await loggedIn();
    const order = await createOrder(user, { status: 'confirmed' });
    const res = await cancel(auth, order.id);
    expect(res.status).toBe(200);
    expect(res.body.data.cancelReason).toBe('Cancelled by customer');
  });

  it.each(['processing', 'shipped', 'delivered'])(
    'refuses to cancel a %s order',
    async (status) => {
      const { user, auth } = await loggedIn();
      const order = await createOrder(user, { status, trackingNumber: 'TCS1' });
      const res = await cancel(auth, order.id);
      expect(res.status).toBe(400);
      expect(res.body.message).toBe(`Orders that are ${status} can no longer be cancelled`);
    },
  );

  it('is safe to repeat: a second cancel is refused and stock is restored only once', async () => {
    const { auth, body, product } = await readyCustomer();
    const { body: placed } = await place(auth, body);
    expect((await cancel(auth, placed.data._id)).status).toBe(200);
    const again = await cancel(auth, placed.data._id);
    expect(again.status).toBe(400);
    expect(again.body.message).toBe('Orders that are cancelled can no longer be cancelled');
    expect(await stockOf(product)).toBe(20); // not 22
  });

  it("returns 404 for another customer's order and for a missing one", async () => {
    const { auth } = await loggedIn();
    const theirs = await createOrder(await createUser());
    expect((await cancel(auth, theirs.id)).status).toBe(404);
    expect((await cancel(auth, missingId())).status).toBe(404);
    expect((await Order.findById(theirs._id)).status).toBe('pending');
  });

  it('returns 400 for a malformed id or a too long reason', async () => {
    const { user, auth } = await loggedIn();
    const order = await createOrder(user);
    expect((await cancel(auth, 'abc')).status).toBe(400);
    const res = await cancel(auth, order.id, { reason: 'x'.repeat(201) });
    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual([
      { field: 'reason', message: 'Reason must be at most 200 characters' },
    ]);
  });
});

/* ====================================================================================
 * Admin: GET /api/admin/orders
 * ==================================================================================== */
describe('GET /api/admin/orders', () => {
  it('lists every order with the customer name and email', async () => {
    const admin = bearer(await createAdmin());
    const ali = await createUser({ name: 'Ali', email: 'ali.orders@test.com' });
    await createOrder(ali);
    await createOrder(await createUser());
    const res = await adminList(admin);
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(2);
    expect(res.body.data.map((o) => o.user.email)).toContain('ali.orders@test.com');
  });

  it('filters by status, payment status, dates and search', async () => {
    const admin = bearer(await createAdmin());
    const ali = await createUser({ email: 'ali.search@test.com' });
    const a = await createOrder(ali, { status: 'confirmed' });
    const b = await createOrder(await createUser());
    await deliverOrder(b);

    const ids = async (query) => (await adminList(admin, query)).body.data.map((o) => o._id);
    expect(await ids('?status=confirmed')).toEqual([a.id]);
    expect(await ids('?paymentStatus=paid')).toEqual([b.id]);
    expect(await ids('?search=ALI.SEARCH')).toEqual([a.id]); // email, case-insensitive
    expect(await ids(`?search=${a.orderNumber}`)).toEqual([a.id]);
    expect(await ids('?search=.*')).toEqual([]); // regex characters are taken literally
    const today = new Date().toISOString().slice(0, 10);
    expect(await ids(`?from=${today}&to=${today}`)).toHaveLength(2);
    expect(await ids('?to=2000-01-01')).toEqual([]);
    expect(await ids('?from=2999-01-01')).toEqual([]);
  });

  it('returns 400 for invalid filters', async () => {
    const admin = bearer(await createAdmin());
    const res = await adminList(admin, '?paymentStatus=maybe&from=yesterday');
    expect(res.status).toBe(400);
    expect(res.body.errors.map((e) => e.field).sort()).toEqual(['from', 'paymentStatus']);
  });
});

/* ====================================================================================
 * Admin: PATCH /api/admin/orders/:id/status (BR-08)
 * ==================================================================================== */
describe('PATCH /api/admin/orders/:id/status', () => {
  it('walks an order through the whole life cycle with emails', async () => {
    const adminUser = await createAdmin();
    const admin = bearer(adminUser);
    const customer = await createUser();
    const order = await createOrder(customer);

    let res = await setStatus(admin, order.id, { status: 'confirmed', note: 'Stock checked' });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Order marked as confirmed');

    res = await setStatus(admin, order.id, { status: 'processing' });
    expect(res.status).toBe(200);

    res = await setStatus(admin, order.id, { status: 'shipped', trackingNumber: 'TCS123' });
    expect(res.body.data.trackingNumber).toBe('TCS123');

    res = await setStatus(admin, order.id, { status: 'delivered' });
    expect(res.body.data).toMatchObject({ status: 'delivered', paymentStatus: 'paid' });
    expect(res.body.data.deliveredAt).toBeDefined();

    const saved = await Order.findById(order._id);
    expect(saved.statusHistory.map((h) => h.status)).toEqual([
      'pending',
      'confirmed',
      'processing',
      'shipped',
      'delivered',
    ]);
    expect(String(saved.statusHistory[1].changedBy)).toBe(adminUser.id);
    // Emails for confirmed, shipped, delivered (processing is internal)
    const subjects = mailsTo(customer.email).map((m) => m.subject);
    expect(subjects).toEqual([
      `Order ${order.orderNumber} has been confirmed`,
      `Order ${order.orderNumber} has been shipped`,
      `Order ${order.orderNumber} has been delivered`,
    ]);
    expect(mailsTo(customer.email)[1].html).toContain('TCS123');
  });

  it.each([
    ['pending', 'shipped'],
    ['pending', 'delivered'],
    ['confirmed', 'pending'],
    ['shipped', 'cancelled'],
    ['delivered', 'cancelled'],
    ['delivered', 'processing'],
    ['cancelled', 'confirmed'],
  ])('refuses %s → %s with 400', async (from, to) => {
    const admin = bearer(await createAdmin());
    const order = await createOrder(await createUser(), { status: from, trackingNumber: 'T1' });
    const res = await setStatus(admin, order.id, { status: to, trackingNumber: 'T2' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe(`Cannot change status from ${from} to ${to}`);
    expect((await Order.findById(order._id)).status).toBe(from);
  });

  it('requires a tracking number to ship', async () => {
    const admin = bearer(await createAdmin());
    const order = await createOrder(await createUser(), { status: 'processing' });
    const res = await setStatus(admin, order.id, { status: 'shipped' });
    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual([
      { field: 'trackingNumber', message: 'Tracking number is required' },
    ]);
  });

  it('cancelling as admin (even while processing) restores stock and coupon', async () => {
    const admin = bearer(await createAdmin());
    const { user, auth, body, product } = await readyCustomer();
    const coupon = await createCoupon({ code: 'ADMIN10' });
    const { body: placed } = await place(auth, { ...body, couponCode: 'ADMIN10' });
    await setStatus(admin, placed.data._id, { status: 'confirmed' });
    await setStatus(admin, placed.data._id, { status: 'processing' });

    const res = await setStatus(admin, placed.data._id, { status: 'cancelled' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      status: 'cancelled',
      cancelReason: 'Cancelled by store',
    });
    expect(await stockOf(product)).toBe(20);
    expect((await Coupon.findById(coupon._id)).usedCount).toBe(0);
    expect(mailsTo(user.email).at(-1).subject).toContain('has been cancelled');
  });

  it('marks a paid order as refunded when it is cancelled', async () => {
    const admin = bearer(await createAdmin());
    const order = await createOrder(await createUser(), {
      paymentMethod: 'CARD',
      paymentStatus: 'paid',
    });
    const res = await setStatus(admin, order.id, { status: 'cancelled', note: 'Fraud check' });
    expect(res.body.data).toMatchObject({ paymentStatus: 'refunded', cancelReason: 'Fraud check' });
  });

  it('still works when the customer account was deleted (no email is sent)', async () => {
    const admin = bearer(await createAdmin());
    const customer = await createUser();
    const order = await createOrder(customer);
    await User.deleteOne({ _id: customer._id });
    const res = await setStatus(admin, order.id, { status: 'confirmed' });
    expect(res.status).toBe(200);
    expect(outbox).toHaveLength(0);
  });

  it('returns 404 for a missing order (both for cancel and other moves)', async () => {
    const admin = bearer(await createAdmin());
    expect((await setStatus(admin, missingId(), { status: 'confirmed' })).status).toBe(404);
    expect((await setStatus(admin, missingId(), { status: 'cancelled' })).status).toBe(404);
  });

  it('returns 400 for an unknown status, a malformed id or too long fields', async () => {
    const admin = bearer(await createAdmin());
    const order = await createOrder(await createUser());
    let res = await setStatus(admin, order.id, { status: 'lost' });
    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual([{ field: 'status', message: 'Invalid status' }]);
    expect((await setStatus(admin, 'abc', { status: 'confirmed' })).status).toBe(400);
    res = await setStatus(admin, order.id, {
      status: 'confirmed',
      note: 'n'.repeat(201),
      trackingNumber: 't'.repeat(51),
    });
    expect(res.body.errors.map((e) => e.field).sort()).toEqual(['note', 'trackingNumber']);
  });
});
