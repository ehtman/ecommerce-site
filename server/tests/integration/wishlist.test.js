/**
 * INTEGRATION tests for /api/wishlist (the customer's saved products).
 *
 * Key promises:
 *  - customers only (401 without a token, 403 for admins)
 *  - IDEMPOTENT add: saving the same product twice keeps ONE copy
 *  - at most 100 products (and a full list still accepts a product it already has)
 *  - unknown / inactive products cannot be saved (404); inactive ones are hidden from the list
 *  - every customer only ever sees their own wishlist
 */
import mongoose from 'mongoose';
import { connectTestDB, clearTestDB, closeTestDB } from '../helpers/db.js';
import {
  api,
  loggedIn,
  bearer,
  createAdmin,
  createProduct,
  createWishlist,
} from '../helpers/factories.js';
import { Wishlist, Product } from '../../src/modules/models.js';
import { LIMITS } from '../../src/config/constants.js';

beforeAll(connectTestDB);
afterEach(clearTestDB);
afterAll(closeTestDB);

const getList = (auth) => api().get('/api/wishlist').set('Authorization', auth);
const save = (auth, productId) =>
  api().post(`/api/wishlist/${productId}`).set('Authorization', auth);
const unsave = (auth, productId) =>
  api().delete(`/api/wishlist/${productId}`).set('Authorization', auth);

const missingId = () => new mongoose.Types.ObjectId().toString();
const pid = (product) => product._id.toString();

describe('Access control (all /api/wishlist routes)', () => {
  const routes = [
    ['GET', (r) => r.get('/api/wishlist')],
    ['POST', (r) => r.post(`/api/wishlist/${missingId()}`)],
    ['DELETE', (r) => r.delete(`/api/wishlist/${missingId()}`)],
  ];

  it.each(routes)('%s returns 401 without a token', async (_name, send) => {
    expect((await send(api())).status).toBe(401);
  });

  it.each(routes)('%s returns 403 for an admin (customers only)', async (_name, send) => {
    const admin = await createAdmin();
    const res = await send(api()).set('Authorization', bearer(admin));
    expect(res.status).toBe(403);
  });
});

describe('GET /api/wishlist', () => {
  it('creates an empty wishlist on first use', async () => {
    const { user, auth } = await loggedIn();
    const res = await getList(auth);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ productIds: [], items: [] });
    expect(await Wishlist.countDocuments({ user: user._id })).toBe(1);
  });

  it('returns product cards and ids, hiding inactive products', async () => {
    const { user, auth } = await loggedIn();
    const shown = await createProduct({ price: 1500 });
    const hidden = await createProduct({ isActive: false });
    await createWishlist(user, [shown, hidden]);

    const { body } = await getList(auth);
    expect(body.data.productIds).toEqual([pid(shown)]);
    expect(body.data.items[0]).toMatchObject({ name: shown.name, price: 1500, stock: 20 });
    // The inactive product stays SAVED (it may come back), it is only hidden
    const saved = await Wishlist.findOne({ user: user._id });
    expect(saved.products).toHaveLength(2);
  });

  it("never shows another customer's wishlist", async () => {
    const alice = await loggedIn();
    const bob = await loggedIn();
    await createWishlist(alice.user, [await createProduct()]);
    const { body } = await getList(bob.auth);
    expect(body.data.items).toHaveLength(0);
  });
});

describe('POST /api/wishlist/:productId', () => {
  it('saves a product', async () => {
    const { auth } = await loggedIn();
    const product = await createProduct();
    const res = await save(auth, pid(product));
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Added to wishlist');
    expect(res.body.data.productIds).toEqual([pid(product)]);
  });

  it('is idempotent: saving the same product twice keeps ONE copy', async () => {
    const { user, auth } = await loggedIn();
    const product = await createProduct();
    await save(auth, pid(product));
    const res = await save(auth, pid(product));

    expect(res.status).toBe(200);
    expect(res.body.data.productIds).toHaveLength(1);
    const saved = await Wishlist.findOne({ user: user._id });
    expect(saved.products).toHaveLength(1);
  });

  it('two parallel saves of the same product still keep one copy ($addToSet)', async () => {
    const { user, auth } = await loggedIn();
    const product = await createProduct();
    await getList(auth); // the list exists
    await Promise.all([save(auth, pid(product)), save(auth, pid(product))]);
    const saved = await Wishlist.findOne({ user: user._id });
    expect(saved.products).toHaveLength(1);
  });

  it(`returns 400 when the wishlist already holds ${LIMITS.MAX_WISHLIST} products`, async () => {
    const { user, auth } = await loggedIn();
    // Ids only: the limit counts saved ids, the products do not need to exist
    const full = Array.from({ length: LIMITS.MAX_WISHLIST }, () => new mongoose.Types.ObjectId());
    await createWishlist(user, full);

    const res = await save(auth, pid(await createProduct()));
    expect(res.status).toBe(400);
    expect(res.body.message).toBe(`Your wishlist can hold at most ${LIMITS.MAX_WISHLIST} products`);
    const saved = await Wishlist.findOne({ user: user._id });
    expect(saved.products).toHaveLength(LIMITS.MAX_WISHLIST);
  });

  it('a full wishlist still accepts a product it already has (idempotent, no 400)', async () => {
    const { user, auth } = await loggedIn();
    const product = await createProduct();
    const others = Array.from(
      { length: LIMITS.MAX_WISHLIST - 1 },
      () => new mongoose.Types.ObjectId(),
    );
    await createWishlist(user, [product, ...others]);
    expect((await save(auth, pid(product))).status).toBe(200);
  });

  it('returns 404 for an unknown product', async () => {
    const { auth } = await loggedIn();
    const res = await save(auth, missingId());
    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Product not found');
  });

  it('returns 404 for an inactive product', async () => {
    const { auth } = await loggedIn();
    const product = await createProduct({ isActive: false });
    expect((await save(auth, pid(product))).status).toBe(404);
  });

  it('returns 400 for a malformed id', async () => {
    const { auth } = await loggedIn();
    const res = await save(auth, 'not-an-id');
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Invalid id');
  });
});

describe('DELETE /api/wishlist/:productId', () => {
  it('removes a saved product', async () => {
    const { user, auth } = await loggedIn();
    const keep = await createProduct();
    const drop = await createProduct();
    await createWishlist(user, [keep, drop]);

    const res = await unsave(auth, pid(drop));
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Removed from wishlist');
    expect(res.body.data.productIds).toEqual([pid(keep)]);
  });

  it('is idempotent: removing a product that is not saved is still 200', async () => {
    const { auth } = await loggedIn();
    const res = await unsave(auth, missingId());
    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(0);
  });

  it('still removes a product that was deleted or switched off', async () => {
    const { user, auth } = await loggedIn();
    const product = await createProduct();
    await createWishlist(user, [product]);
    await Product.updateOne({ _id: product._id }, { isActive: false });
    await unsave(auth, pid(product));
    const saved = await Wishlist.findOne({ user: user._id });
    expect(saved.products).toHaveLength(0);
  });

  it('returns 400 for a malformed id', async () => {
    const { auth } = await loggedIn();
    expect((await unsave(auth, 'abc')).status).toBe(400);
  });
});
