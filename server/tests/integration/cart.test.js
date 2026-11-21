/**
 * INTEGRATION tests for /api/cart (the customer's shopping cart).
 *
 * Key promises:
 *  - customers only (401 without a token, 403 for admins)
 *  - prices ALWAYS come from the database: a price sent by the client is ignored, and a
 *    price change in the database shows up in the cart immediately
 *  - BR-04: at most 10 per product and never more than the stock (also when adding to a
 *    line that already exists)
 *  - BR-02: Rs 250 shipping, free from Rs 5,000
 *  - inactive / sold-out products: cannot be added (404 / 400); already in the cart → kept,
 *    marked with an `issue` and left out of the totals
 *  - every customer only ever sees their own cart
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
} from '../helpers/factories.js';
import { Cart, Product } from '../../src/modules/models.js';

beforeAll(connectTestDB);
afterEach(clearTestDB);
afterAll(closeTestDB);

// Short request helpers: each test reads like a sentence
const getCart = (auth) => api().get('/api/cart').set('Authorization', auth);
const add = (auth, body) => api().post('/api/cart/items').set('Authorization', auth).send(body);
const update = (auth, productId, body) =>
  api().put(`/api/cart/items/${productId}`).set('Authorization', auth).send(body);
const removeItem = (auth, productId) =>
  api().delete(`/api/cart/items/${productId}`).set('Authorization', auth);
const clear = (auth) => api().delete('/api/cart').set('Authorization', auth);

// A valid id that belongs to no document
const missingId = () => new mongoose.Types.ObjectId().toString();
const pid = (product) => product._id.toString();

describe('Access control (all /api/cart routes)', () => {
  const routes = [
    ['GET /cart', (r) => r.get('/api/cart')],
    ['DELETE /cart', (r) => r.delete('/api/cart')],
    ['POST /items', (r) => r.post('/api/cart/items').send({ productId: missingId(), quantity: 1 })],
    ['PUT /items/:id', (r) => r.put(`/api/cart/items/${missingId()}`).send({ quantity: 1 })],
    ['DELETE /items/:id', (r) => r.delete(`/api/cart/items/${missingId()}`)],
  ];

  it.each(routes)('%s returns 401 without a token', async (_name, send) => {
    const res = await send(api());
    expect(res.status).toBe(401);
  });

  it.each(routes)('%s returns 403 for an admin (customers only)', async (_name, send) => {
    const admin = await createAdmin();
    const res = await send(api()).set('Authorization', bearer(admin));
    expect(res.status).toBe(403);
    expect(res.body.message).toBe('Access denied');
  });
});

describe('GET /api/cart', () => {
  it('creates an empty cart on first use (upsert) and returns zero totals', async () => {
    const { user, auth } = await loggedIn();
    const res = await getCart(auth);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      items: [],
      itemCount: 0,
      subtotal: 0,
      shipping: 0, // nothing to ship → no fee
      total: 0,
      hasIssues: false,
      freeShippingMin: 5000,
    });
    expect(await Cart.countDocuments({ user: user._id })).toBe(1);
    // A second call does not create a second cart
    await getCart(auth);
    expect(await Cart.countDocuments({ user: user._id })).toBe(1);
  });

  it('calculates line totals, subtotal, shipping and total on the server', async () => {
    const { user, auth } = await loggedIn();
    const mug = await createProduct({ price: 1200 });
    const pen = await createProduct({ price: 300 });
    await addToCart(user, mug, 2);
    await addToCart(user, pen, 1);

    const { body } = await getCart(auth);
    expect(body.data.items.map((i) => i.lineTotal)).toEqual([2400, 300]);
    expect(body.data).toMatchObject({
      itemCount: 3,
      subtotal: 2700,
      shipping: 250,
      total: 2950,
      hasIssues: false,
    });
    // The product card has what the cart page needs, and nothing internal
    expect(body.data.items[0].product).toMatchObject({
      name: mug.name,
      slug: mug.slug,
      price: 1200,
      stock: 20,
      isActive: true,
      image: mug.images[0].url, // the first picture becomes the card image
    });
    expect(body.data.items[0].product.createdBy).toBeUndefined();
  });

  it('gives free shipping at exactly Rs 5,000', async () => {
    const { user, auth } = await loggedIn();
    await addToCart(user, await createProduct({ price: 2500 }), 2);
    const { body } = await getCart(auth);
    expect(body.data).toMatchObject({ subtotal: 5000, shipping: 0, total: 5000 });
  });

  it('always shows the CURRENT database price (the cart stores no prices)', async () => {
    const { user, auth } = await loggedIn();
    const product = await createProduct({ price: 1000 });
    await addToCart(user, product, 2);
    await Product.updateOne({ _id: product._id }, { price: 1500 }); // admin changes the price

    const { body } = await getCart(auth);
    expect(body.data.items[0].lineTotal).toBe(3000);
    expect(body.data.subtotal).toBe(3000);
  });

  it('keeps inactive and sold-out lines, marks them, and leaves them out of the totals', async () => {
    const { user, auth } = await loggedIn();
    const ok = await createProduct({ price: 1000 });
    const hidden = await createProduct({ price: 500, isActive: false });
    const soldOut = await createProduct({ price: 700, stock: 0 });
    const low = await createProduct({ price: 900, stock: 2 });
    await addToCart(user, ok, 1);
    await addToCart(user, hidden, 1);
    await addToCart(user, soldOut, 1);
    await addToCart(user, low, 3); // stock dropped to 2 after it was added

    const { body } = await getCart(auth);
    expect(body.data.items.map((i) => i.issue)).toEqual([
      null,
      'This product is no longer available',
      'Out of stock',
      'Only 2 left in stock',
    ]);
    expect(body.data).toMatchObject({
      itemCount: 1,
      subtotal: 1000,
      shipping: 250,
      total: 1250,
      hasIssues: true, // the UI blocks checkout
    });
  });

  it('removes lines whose product was deleted from the database (self-healing)', async () => {
    const { user, auth } = await loggedIn();
    const kept = await createProduct();
    const deleted = await createProduct();
    await addToCart(user, kept, 1);
    await addToCart(user, deleted, 1);
    await Product.deleteOne({ _id: deleted._id });

    const { body } = await getCart(auth);
    expect(body.data.items).toHaveLength(1);
    const saved = await Cart.findOne({ user: user._id });
    expect(saved.items.map((i) => String(i.product))).toEqual([pid(kept)]);
  });

  it("never shows another customer's cart", async () => {
    const alice = await loggedIn();
    const bob = await loggedIn();
    await addToCart(alice.user, await createProduct(), 3);

    const { body } = await getCart(bob.auth);
    expect(body.data.items).toHaveLength(0);
  });
});

describe('POST /api/cart/items', () => {
  it('adds a product and returns the recalculated cart', async () => {
    const { auth } = await loggedIn();
    const product = await createProduct({ price: 1000 });

    const res = await add(auth, { productId: pid(product), quantity: 2 });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Added to cart');
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data).toMatchObject({ itemCount: 2, subtotal: 2000, total: 2250 });
  });

  it('IGNORES a price (or total) sent by the client – price tampering', async () => {
    const { user, auth } = await loggedIn();
    const product = await createProduct({ price: 4000 });

    const res = await add(auth, { productId: pid(product), quantity: 1, price: 1, total: 1 });
    expect(res.status).toBe(200);
    expect(res.body.data.items[0].product.price).toBe(4000);
    expect(res.body.data.subtotal).toBe(4000);
    expect(res.body.data.total).toBe(4250);
    // Nothing price-like was stored in the cart
    const saved = await Cart.findOne({ user: user._id }).lean();
    expect(saved.items[0]).not.toHaveProperty('price');
  });

  it('adding the same product again ADDS the quantities (one line per product)', async () => {
    const { user, auth } = await loggedIn();
    const product = await createProduct();
    await add(auth, { productId: pid(product), quantity: 2 });
    const res = await add(auth, { productId: pid(product), quantity: 3 });

    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].quantity).toBe(5);
    const saved = await Cart.findOne({ user: user._id });
    expect(saved.items).toHaveLength(1);
  });

  it('accepts exactly 10 (the maximum)', async () => {
    const { auth } = await loggedIn();
    const product = await createProduct({ stock: 50 });
    const res = await add(auth, { productId: pid(product), quantity: 10 });
    expect(res.status).toBe(200);
    expect(res.body.data.items[0].quantity).toBe(10);
  });

  it('returns 400 when the running total would pass 10 (BR-04)', async () => {
    const { user, auth } = await loggedIn();
    const product = await createProduct({ stock: 50 });
    await addToCart(user, product, 8);

    const res = await add(auth, { productId: pid(product), quantity: 3 });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('You can buy at most 10 of one product');
    // The cart is unchanged
    const saved = await Cart.findOne({ user: user._id });
    expect(saved.items[0].quantity).toBe(8);
  });

  it('returns 400 when asking for more than the stock', async () => {
    const { auth } = await loggedIn();
    const product = await createProduct({ stock: 3 });
    const res = await add(auth, { productId: pid(product), quantity: 4 });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe(`Only 3 of ${product.name} left in stock`);
  });

  it('returns 400 when the running total would pass the stock', async () => {
    const { user, auth } = await loggedIn();
    const product = await createProduct({ stock: 5 });
    await addToCart(user, product, 4);
    const res = await add(auth, { productId: pid(product), quantity: 2 });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Only 5 of/);
  });

  it('returns 400 for a sold-out product', async () => {
    const { auth } = await loggedIn();
    const product = await createProduct({ stock: 0 });
    const res = await add(auth, { productId: pid(product), quantity: 1 });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe(`${product.name} is out of stock`);
  });

  it('returns 404 for an unknown product', async () => {
    const { auth } = await loggedIn();
    const res = await add(auth, { productId: missingId(), quantity: 1 });
    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Product not found');
  });

  it('returns 404 for an inactive product (hidden products cannot be bought)', async () => {
    const { auth } = await loggedIn();
    const product = await createProduct({ isActive: false });
    const res = await add(auth, { productId: pid(product), quantity: 1 });
    expect(res.status).toBe(404);
  });

  it.each([
    [{ quantity: 1 }, 'productId'],
    [{ productId: 'abc', quantity: 1 }, 'productId'],
    [{ productId: missingId() }, 'quantity'],
    [{ productId: missingId(), quantity: 0 }, 'quantity'],
    [{ productId: missingId(), quantity: 11 }, 'quantity'],
    [{ productId: missingId(), quantity: 1.5 }, 'quantity'],
    [{ productId: missingId(), quantity: 'two' }, 'quantity'],
  ])('returns 400 for %j (field %s)', async (body, field) => {
    const { auth } = await loggedIn();
    const res = await add(auth, body);
    expect(res.status).toBe(400);
    expect(res.body.errors.map((e) => e.field)).toContain(field);
  });

  it('accepts a numeric string quantity ("2" → 2)', async () => {
    const { auth } = await loggedIn();
    const product = await createProduct();
    const res = await add(auth, { productId: pid(product), quantity: '2' });
    expect(res.status).toBe(200);
    expect(res.body.data.items[0].quantity).toBe(2);
  });
});

describe('PUT /api/cart/items/:productId', () => {
  it('sets (replaces) the quantity of a line', async () => {
    const { user, auth } = await loggedIn();
    const product = await createProduct({ price: 1000 });
    await addToCart(user, product, 2);

    const res = await update(auth, pid(product), { quantity: 5 });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Cart updated');
    expect(res.body.data.items[0].quantity).toBe(5);
    expect(res.body.data).toMatchObject({ subtotal: 5000, shipping: 0, total: 5000 });
  });

  it('ignores a price sent by the client', async () => {
    const { user, auth } = await loggedIn();
    const product = await createProduct({ price: 1000 });
    await addToCart(user, product, 1);
    const res = await update(auth, pid(product), { quantity: 2, price: 1 });
    expect(res.body.data.subtotal).toBe(2000);
  });

  it('returns 400 above the stock', async () => {
    const { user, auth } = await loggedIn();
    const product = await createProduct({ stock: 4 });
    await addToCart(user, product, 1);
    const res = await update(auth, pid(product), { quantity: 5 });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Only 4 of/);
  });

  it.each([[0], [11], ['x'], [undefined]])('returns 400 for quantity %p', async (quantity) => {
    const { user, auth } = await loggedIn();
    const product = await createProduct();
    await addToCart(user, product, 1);
    const res = await update(auth, pid(product), { quantity });
    expect(res.status).toBe(400);
    expect(res.body.errors[0].field).toBe('quantity');
  });

  it('returns 400 for a malformed id', async () => {
    const { auth } = await loggedIn();
    const res = await update(auth, 'abc', { quantity: 1 });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Invalid id');
  });

  it('returns 404 when the product is not in my cart', async () => {
    const { auth } = await loggedIn();
    const product = await createProduct();
    const res = await update(auth, pid(product), { quantity: 1 });
    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Item not in cart');
  });

  it('returns 404 for an unknown or inactive product', async () => {
    const { user, auth } = await loggedIn();
    const product = await createProduct();
    await addToCart(user, product, 1);
    await Product.updateOne({ _id: product._id }, { isActive: false });

    expect((await update(auth, pid(product), { quantity: 2 })).status).toBe(404);
    expect((await update(auth, missingId(), { quantity: 2 })).status).toBe(404);
  });

  it("cannot change another customer's line (each customer has their own cart)", async () => {
    const alice = await loggedIn();
    const bob = await loggedIn();
    const product = await createProduct();
    await addToCart(alice.user, product, 1);

    const res = await update(bob.auth, pid(product), { quantity: 7 });
    expect(res.status).toBe(404);
    const aliceCart = await Cart.findOne({ user: alice.user._id });
    expect(aliceCart.items[0].quantity).toBe(1);
  });
});

describe('DELETE /api/cart/items/:productId', () => {
  it('removes one line and recalculates', async () => {
    const { user, auth } = await loggedIn();
    const keep = await createProduct({ price: 1000 });
    const drop = await createProduct({ price: 2000 });
    await addToCart(user, keep, 1);
    await addToCart(user, drop, 1);

    const res = await removeItem(auth, pid(drop));
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Item removed');
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.subtotal).toBe(1000);
  });

  it('is idempotent: removing a product that is not in the cart is still 200', async () => {
    const { auth } = await loggedIn();
    const res = await removeItem(auth, missingId());
    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(0);
  });

  it('returns 400 for a malformed id', async () => {
    const { auth } = await loggedIn();
    expect((await removeItem(auth, 'abc')).status).toBe(400);
  });
});

describe('DELETE /api/cart', () => {
  it('empties the cart', async () => {
    const { user, auth } = await loggedIn();
    await addToCart(user, await createProduct(), 2);
    await addToCart(user, await createProduct(), 1);

    const res = await clear(auth);
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Cart cleared');
    expect(res.body.data).toMatchObject({ items: [], subtotal: 0, shipping: 0, total: 0 });
    const saved = await Cart.findOne({ user: user._id });
    expect(saved.items).toHaveLength(0);
  });

  it("does not touch another customer's cart", async () => {
    const alice = await loggedIn();
    const bob = await loggedIn();
    await addToCart(alice.user, await createProduct(), 2);
    await clear(bob.auth);
    const aliceCart = await Cart.findOne({ user: alice.user._id });
    expect(aliceCart.items).toHaveLength(1);
  });
});
