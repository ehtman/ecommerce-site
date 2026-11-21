/**
 * INTEGRATION tests for the two hardest promises of checkout:
 *
 * 1) NO OVERSELLING UNDER CONCURRENCY (race conditions)
 *    Several customers press "Place order" at the same moment for the last unit(s).
 *    Because reserveStock() is ONE atomic conditional update (`stock >= qty`), and because
 *    MongoDB makes conflicting transactions retry, exactly as many orders succeed as there
 *    are units. The same holds for a coupon with a usage limit.
 *
 * 2) ALL-OR-NOTHING (rollback)
 *    If anything fails half-way through the checkout transaction, the stock, the coupon
 *    counter and the cart are exactly as before, and no order exists.
 *
 * These tests need a real replica set (transactions); tests/setup/globalSetup.js starts one.
 * See docs/concepts/20-transactions-and-race-conditions.md.
 */
import { jest } from '@jest/globals';
import { connectTestDB, clearTestDB, closeTestDB } from '../helpers/db.js';
import {
  api,
  loggedIn,
  createAddress,
  createProduct,
  createCoupon,
  addToCart,
  createOrder,
} from '../helpers/factories.js';
import { Order, Product, Cart, Coupon } from '../../src/modules/models.js';
import { outbox } from '../../src/emails/sendEmail.js';

beforeAll(connectTestDB);
afterEach(async () => {
  jest.restoreAllMocks(); // undo every spy, even when a test failed half-way
  await clearTestDB();
});
afterAll(closeTestDB);

const place = (auth, body) => api().post('/api/orders').set('Authorization', auth).send(body);
const cancel = (auth, id) => api().patch(`/api/orders/${id}/cancel`).set('Authorization', auth);

/** A verified customer with an address and `quantity` of `product` in the cart. */
async function buyer(product, quantity = 1) {
  const { user, auth } = await loggedIn();
  const address = await createAddress(user, { isDefault: true });
  await addToCart(user, product, quantity);
  return { user, auth, body: { addressId: address._id.toString() } };
}

// Sorts the status codes so the assertion does not depend on who won the race
const statuses = (responses) => responses.map((r) => r.status).sort();

describe('Concurrency: no overselling', () => {
  it('two customers, ONE unit left: exactly one order succeeds', async () => {
    const product = await createProduct({ stock: 1 });
    const a = await buyer(product);
    const b = await buyer(product);

    // Fire both requests at the same time
    const results = await Promise.all([place(a.auth, a.body), place(b.auth, b.body)]);

    expect(statuses(results)).toEqual([201, 409]);
    const loser = results.find((r) => r.status === 409);
    expect(loser.body.errors[0].reason).toMatch(/^Only \d+ left in stock$/);
    const fresh = await Product.findById(product._id);
    expect(fresh.stock).toBe(0); // never negative
    expect(fresh.sold).toBe(1);
    expect(await Order.countDocuments()).toBe(1);
  });

  it('five customers, three units: exactly three orders succeed', async () => {
    const product = await createProduct({ stock: 3 });
    const buyers = [];
    for (let i = 0; i < 5; i += 1) buyers.push(await buyer(product));

    const results = await Promise.all(buyers.map((b) => place(b.auth, b.body)));

    expect(results.filter((r) => r.status === 201)).toHaveLength(3);
    expect(results.filter((r) => r.status === 409)).toHaveLength(2);
    expect((await Product.findById(product._id)).stock).toBe(0);
    expect(await Order.countDocuments()).toBe(3);
  });

  it('a double click by the SAME customer creates only one order', async () => {
    const product = await createProduct({ stock: 20 });
    const me = await buyer(product, 2);

    const results = await Promise.all([place(me.auth, me.body), place(me.auth, me.body)]);

    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(await Order.countDocuments()).toBe(1);
    expect((await Product.findById(product._id)).stock).toBe(18); // taken once
  });

  it('a coupon with ONE use left is consumed only once', async () => {
    const product = await createProduct({ stock: 10 });
    const coupon = await createCoupon({ code: 'LASTONE', usageLimit: 1 });
    const a = await buyer(product);
    const b = await buyer(product);

    const results = await Promise.all([
      place(a.auth, { ...a.body, couponCode: 'LASTONE' }),
      place(b.auth, { ...b.body, couponCode: 'LASTONE' }),
    ]);

    expect(statuses(results)).toEqual([201, 400]);
    expect(results.find((r) => r.status === 400).body.message).toBe('Coupon usage limit reached');
    expect((await Coupon.findById(coupon._id)).usedCount).toBe(1);
    expect((await Product.findById(product._id)).stock).toBe(9); // the loser's unit came back
  });

  it('two parallel cancels give the stock back only once', async () => {
    const product = await createProduct({ stock: 5 });
    const me = await buyer(product, 2);
    const { body: placed } = await place(me.auth, me.body);

    const results = await Promise.all([
      cancel(me.auth, placed.data._id),
      cancel(me.auth, placed.data._id),
    ]);

    expect(statuses(results)).toEqual([200, 400]);
    expect((await Product.findById(product._id)).stock).toBe(5); // not 7
  });
});

describe('Rollback: a failure half-way changes nothing', () => {
  // Everything a checkout touches, read straight from the database
  async function snapshot(user, product, coupon) {
    const [p, cart, c, orders] = await Promise.all([
      Product.findById(product._id).lean(),
      Cart.findOne({ user: user._id }).lean(),
      Coupon.findById(coupon._id).lean(),
      Order.countDocuments(),
    ]);
    return {
      stock: p.stock,
      sold: p.sold,
      cartItems: cart.items.map((i) => [String(i.product), i.quantity]),
      couponUses: c.usedCount,
      orders,
    };
  }

  it('creating the order fails AFTER stock and coupon were taken → all undone', async () => {
    const product = await createProduct({ stock: 5 });
    const coupon = await createCoupon({ code: 'ROLLBACK', usageLimit: 5 });
    const me = await buyer(product, 2);
    const before = await snapshot(me.user, product, coupon);

    // Simulate a crash at step 3 (stock and coupon were already changed in the transaction)
    jest.spyOn(Order, 'create').mockRejectedValueOnce(new Error('Database hiccup'));
    const res = await place(me.auth, { ...me.body, couponCode: 'ROLLBACK' });

    expect(res.status).toBe(500);
    expect(await snapshot(me.user, product, coupon)).toEqual(before);
    expect(outbox).toHaveLength(0); // no confirmation for an order that does not exist
  });

  it('emptying the cart fails at the very END → the new order disappears too', async () => {
    const product = await createProduct({ stock: 5 });
    const coupon = await createCoupon({ code: 'LASTSTEP', usageLimit: 5 });
    const me = await buyer(product, 2);
    const before = await snapshot(me.user, product, coupon);

    // The last write of the transaction (cart.save) fails
    jest.spyOn(Cart.prototype, 'save').mockRejectedValueOnce(new Error('Disk full'));
    const res = await place(me.auth, { ...me.body, couponCode: 'LASTSTEP' });

    expect(res.status).toBe(500);
    const after = await snapshot(me.user, product, coupon);
    expect(after).toEqual(before);
    expect(after.orders).toBe(0); // the order created in step 3 was rolled back
  });

  it('a failure while cancelling keeps the order and the stock as they were', async () => {
    const product = await createProduct({ stock: 5 });
    const { user, auth } = await loggedIn();
    // An order that holds 2 units (the factory does not take stock, so we do it here)
    const order = await createOrder(user, { product, quantity: 2 });
    await Product.updateOne({ _id: product._id }, { $inc: { stock: -2, sold: 2 } });

    // The stock is given back first, then saving the order fails → the restore is undone
    jest.spyOn(Order.prototype, 'save').mockRejectedValueOnce(new Error('Network blip'));
    const res = await cancel(auth, order.id);

    expect(res.status).toBe(500);
    expect((await Order.findById(order._id)).status).toBe('pending');
    expect((await Product.findById(product._id)).stock).toBe(3);
  });
});
