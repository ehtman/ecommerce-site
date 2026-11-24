/**
 * INTEGRATION tests for product reviews:
 *   GET    /api/products/:id/reviews               (public list)
 *   GET    /api/products/:id/reviews/eligibility   (may I review?)
 *   POST   /api/products/:id/reviews               (customer writes)
 *   PUT    /api/reviews/:id                        (author edits)
 *   DELETE /api/reviews/:id                        (author or admin deletes)
 *   GET    /api/reviews/admin                      (admin moderation list)
 *   PATCH  /api/reviews/:id/visibility             (admin hides / shows)
 *
 * Key promises:
 *  - only customers with a DELIVERED order containing the product may review (403 otherwise)
 *  - one review per product per customer (409, also under a race)
 *  - only the author edits; author or admin deletes; others get 404 (no IDOR)
 *  - Product.ratingAverage / ratingCount are recalculated EXACTLY after every change,
 *    counting only visible reviews
 */
import mongoose from 'mongoose';
import { jest } from '@jest/globals';
import { connectTestDB, clearTestDB, closeTestDB } from '../helpers/db.js';
import {
  api,
  bearer,
  loggedIn,
  createAdmin,
  createProduct,
  createOrder,
  deliverOrder,
  createReview,
  validAddress,
} from '../helpers/factories.js';
import { Review, Product } from '../../src/modules/models.js';

beforeAll(connectTestDB);
afterEach(clearTestDB);
afterAll(closeTestDB);

// A valid id that belongs to no document
const missingId = () => new mongoose.Types.ObjectId().toString();
// A complete, valid review body
const validReview = (overrides = {}) => ({
  rating: 4,
  title: 'Solid mug',
  comment: 'Strong handle and keeps tea hot for ages.',
  ...overrides,
});

// Short request helpers: each test reads like a sentence
const list = (productId, query = '') => api().get(`/api/products/${productId}/reviews${query}`);
const eligibility = (auth, productId) =>
  api().get(`/api/products/${productId}/reviews/eligibility`).set('Authorization', auth);
const create = (auth, productId, body = validReview()) =>
  api().post(`/api/products/${productId}/reviews`).set('Authorization', auth).send(body);
const update = (auth, id, body = validReview()) =>
  api().put(`/api/reviews/${id}`).set('Authorization', auth).send(body);
const remove = (auth, id) => api().delete(`/api/reviews/${id}`).set('Authorization', auth);
const adminList = (auth, query = '') =>
  api().get(`/api/reviews/admin${query}`).set('Authorization', auth);
const setVisibility = (auth, id, isVisible) =>
  api().patch(`/api/reviews/${id}/visibility`).set('Authorization', auth).send({ isVisible });

// The product's denormalized rating, read fresh from the DATABASE
const ratingOf = async (product) => {
  const p = await Product.findById(product._id).lean();
  return { average: p.ratingAverage, count: p.ratingCount };
};

/** A logged-in customer who has RECEIVED `product` (delivered order). */
async function buyer(product, overrides = {}) {
  const customer = await loggedIn(overrides);
  const order = await deliverOrder(await createOrder(customer.user, { product }));
  return { ...customer, order };
}

describe('Access control', () => {
  const protectedRoutes = [
    ['GET eligibility', (r) => r.get(`/api/products/${missingId()}/reviews/eligibility`)],
    ['POST create', (r) => r.post(`/api/products/${missingId()}/reviews`).send(validReview())],
    ['PUT update', (r) => r.put(`/api/reviews/${missingId()}`).send(validReview())],
    ['DELETE', (r) => r.delete(`/api/reviews/${missingId()}`)],
    ['GET admin list', (r) => r.get('/api/reviews/admin')],
    ['PATCH visibility', (r) => r.patch(`/api/reviews/${missingId()}/visibility`)],
  ];

  it.each(protectedRoutes)('%s returns 401 without a token', async (_name, send) => {
    const res = await send(api());
    expect(res.status).toBe(401);
  });

  it.each(protectedRoutes)('%s returns 401 with a forged token', async (_name, send) => {
    const res = await send(api()).set('Authorization', 'Bearer not.a.real.token');
    expect(res.status).toBe(401);
  });

  it.each([
    ['POST create', (r) => r.post(`/api/products/${missingId()}/reviews`).send(validReview())],
    ['PUT update', (r) => r.put(`/api/reviews/${missingId()}`).send(validReview())],
  ])('%s returns 403 for an admin (customers write reviews)', async (_name, send) => {
    const admin = await createAdmin();
    const res = await send(api()).set('Authorization', bearer(admin));
    expect(res.status).toBe(403);
    expect(res.body.message).toBe('Access denied');
  });

  it.each([
    ['GET admin list', (r) => r.get('/api/reviews/admin')],
    [
      'PATCH visibility',
      (r) => r.patch(`/api/reviews/${missingId()}/visibility`).send({ isVisible: false }),
    ],
  ])('%s returns 403 for a customer (admins only)', async (_name, send) => {
    const { auth } = await loggedIn();
    const res = await send(api()).set('Authorization', auth);
    expect(res.status).toBe(403);
    expect(res.body.message).toBe('Access denied');
  });

  it('a disabled customer cannot review (403)', async () => {
    const product = await createProduct();
    const { auth } = await buyer(product, { isActive: false });
    expect((await create(auth, product._id)).status).toBe(403);
  });
});

describe('GET /api/products/:id/reviews (public)', () => {
  it('lists only VISIBLE reviews of that product, newest first, with the author name only', async () => {
    const product = await createProduct();
    const other = await createProduct();
    const a = await loggedIn({ name: 'Ayesha' });
    const b = await loggedIn({ name: 'Bilal' });
    const c = await loggedIn({ name: 'Hidden Person' });
    const first = await createReview(a.user, product, { rating: 5 });
    const second = await createReview(b.user, product, { rating: 3 });
    await createReview(c.user, product, { isVisible: false }); // moderated away
    await createReview(a.user, other); // another product

    const res = await list(product._id); // no token needed
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Reviews fetched');
    expect(res.body.data.map((r) => r._id)).toEqual([String(second._id), String(first._id)]);
    expect(res.body.data[0].user).toEqual({ _id: String(b.user._id), name: 'Bilal' });
    expect(res.body.data[0].user.email).toBeUndefined(); // reviewers' emails stay private
    expect(res.body.meta).toEqual({ page: 1, limit: 5, total: 2, pages: 1 });
  });

  it('paginates with ?page and ?limit (limit capped at 20)', async () => {
    const product = await createProduct();
    for (let i = 0; i < 3; i += 1) {
      const { user } = await loggedIn();
      await createReview(user, product);
    }
    const page2 = await list(product._id, '?page=2&limit=2');
    expect(page2.body.data).toHaveLength(1);
    expect(page2.body.meta).toEqual({ page: 2, limit: 2, total: 3, pages: 2 });

    const capped = await list(product._id, '?limit=500');
    expect(capped.body.meta.limit).toBe(20);
  });

  it('returns an empty page for a product without reviews', async () => {
    const product = await createProduct();
    const res = await list(product._id);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.total).toBe(0);
  });

  it('returns 400 for an invalid product id', async () => {
    const res = await list('not-an-id');
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Invalid id');
  });

  it('returns 404 for a product that does not exist', async () => {
    const res = await list(missingId());
    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Product not found');
  });
});

describe('GET /api/products/:id/reviews/eligibility', () => {
  it('canReview: true after the order is delivered', async () => {
    const product = await createProduct();
    const { auth } = await buyer(product);
    const res = await eligibility(auth, product._id);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ canReview: true });
  });

  it('canReview: false (with a reason) while the order is not delivered yet', async () => {
    const product = await createProduct();
    const { user, auth } = await loggedIn();
    await createOrder(user, { product, status: 'shipped', trackingNumber: 'TRK1' });
    const res = await eligibility(auth, product._id);
    expect(res.body.data).toEqual({
      canReview: false,
      reason: 'You can review this product after it is delivered to you',
    });
  });

  it('canReview: false and returns my review when I already reviewed', async () => {
    const product = await createProduct();
    const { user, auth } = await loggedIn();
    const review = await createReview(user, product);
    const res = await eligibility(auth, product._id);
    expect(res.body.data.canReview).toBe(false);
    expect(res.body.data.reason).toBe('You already reviewed this product');
    expect(res.body.data.review._id).toBe(String(review._id));
  });

  it('canReview: false for an admin', async () => {
    const product = await createProduct();
    const admin = await createAdmin();
    const res = await eligibility(bearer(admin), product._id);
    expect(res.body.data).toEqual({ canReview: false, reason: 'Only customers can review' });
  });

  it('returns 400 for an invalid id and 404 for a missing product', async () => {
    const { auth } = await loggedIn();
    expect((await eligibility(auth, 'abc')).status).toBe(400);
    expect((await eligibility(auth, missingId())).status).toBe(404);
  });
});

describe('POST /api/products/:id/reviews', () => {
  it('creates my review (201) and updates the product rating', async () => {
    const product = await createProduct();
    const { user, auth, order } = await buyer(product);

    const res = await create(auth, product._id, validReview({ rating: 4 }));
    expect(res.status).toBe(201);
    expect(res.body.message).toBe('Thank you for your review');
    expect(res.body.data).toMatchObject({
      ...validReview({ rating: 4 }),
      user: String(user._id),
      product: String(product._id),
      order: String(order._id), // the proof of purchase is remembered
      isVisible: true,
    });
    expect(res.body.data.__v).toBeUndefined();
    expect(await ratingOf(product)).toEqual({ average: 4, count: 1 });
  });

  it('accepts a review without a title and trims the text', async () => {
    const product = await createProduct();
    const { auth } = await buyer(product);
    const res = await create(auth, product._id, {
      rating: '5', // HTML forms send strings → converted to a number
      comment: '   Really happy with it!   ',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.rating).toBe(5);
    expect(res.body.data.comment).toBe('Really happy with it!');
    expect(res.body.data.title).toBeUndefined();
  });

  it('ignores mass assignment: user, order and isVisible come from the server', async () => {
    const product = await createProduct();
    const { user, auth, order } = await buyer(product);
    const stranger = await loggedIn();
    const res = await create(
      auth,
      product._id,
      validReview({ user: String(stranger.user._id), isVisible: false, order: missingId() }),
    );
    expect(res.status).toBe(201);
    expect(res.body.data.user).toBe(String(user._id));
    expect(res.body.data.isVisible).toBe(true);
    expect(res.body.data.order).toBe(String(order._id)); // the real delivered order
  });

  it.each([
    ['rating missing', { rating: undefined }, 'rating'],
    ['rating 0', { rating: 0 }, 'rating'],
    ['rating 6', { rating: 6 }, 'rating'],
    ['rating 4.5', { rating: 4.5 }, 'rating'],
    ['rating as words', { rating: 'five' }, 'rating'],
    ['comment missing', { comment: undefined }, 'comment'],
    ['comment not text', { comment: 12345678901 }, 'comment'],
    ['comment too short', { comment: 'ok' }, 'comment'],
    ['comment only spaces', { comment: '          ' }, 'comment'],
    ['comment too long', { comment: 'a'.repeat(1001) }, 'comment'],
    ['title too long', { title: 't'.repeat(81) }, 'title'],
    ['title not text', { title: 42 }, 'title'],
  ])('returns 400 when %s', async (_name, change, field) => {
    const product = await createProduct();
    const { auth } = await buyer(product);
    const res = await create(auth, product._id, validReview(change));
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Validation failed');
    expect(res.body.errors.map((e) => e.field)).toContain(field);
    expect(await Review.countDocuments()).toBe(0);
  });

  it('returns 400 for an invalid product id', async () => {
    const { auth } = await loggedIn();
    expect((await create(auth, 'abc')).status).toBe(400);
  });

  it('returns 403 when I never ordered the product', async () => {
    const product = await createProduct();
    const { auth } = await loggedIn();
    const res = await create(auth, product._id);
    expect(res.status).toBe(403);
    expect(res.body.message).toBe('You can only review products from your delivered orders');
  });

  it.each([
    ['pending', {}],
    ['confirmed', { status: 'confirmed' }],
    ['shipped', { status: 'shipped', trackingNumber: 'TRK1' }],
    ['cancelled', { status: 'cancelled' }],
  ])('returns 403 while my order is %s (not delivered)', async (_name, orderFields) => {
    const product = await createProduct();
    const { user, auth } = await loggedIn();
    await createOrder(user, { product, ...orderFields });
    const res = await create(auth, product._id);
    expect(res.status).toBe(403);
  });

  it('returns 403 when my delivered order contains a DIFFERENT product', async () => {
    const product = await createProduct();
    const otherProduct = await createProduct();
    const { auth } = await buyer(otherProduct);
    expect((await create(auth, product._id)).status).toBe(403);
  });

  it("returns 403 when only SOMEONE ELSE's order was delivered", async () => {
    const product = await createProduct();
    await buyer(product); // another customer received it
    const { auth } = await loggedIn();
    expect((await create(auth, product._id)).status).toBe(403);
  });

  it('returns 404 for a product that does not exist', async () => {
    const { auth } = await loggedIn();
    const res = await create(auth, missingId());
    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Product not found');
  });

  it('returns 409 for a second review of the same product (one voice per customer)', async () => {
    const product = await createProduct();
    const { auth } = await buyer(product);
    expect((await create(auth, product._id)).status).toBe(201);

    const res = await create(auth, product._id, validReview({ rating: 1 }));
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('You already reviewed this product');
    expect(await ratingOf(product)).toEqual({ average: 4, count: 1 }); // unchanged
  });

  it('a second delivered order does NOT allow a second review', async () => {
    const product = await createProduct();
    const { user, auth } = await buyer(product);
    await deliverOrder(await createOrder(user, { product })); // bought it again
    expect((await create(auth, product._id)).status).toBe(201);
    expect((await create(auth, product._id)).status).toBe(409);
  });

  it('two simultaneous submits create exactly ONE review (unique index wins the race)', async () => {
    const product = await createProduct();
    const { auth } = await buyer(product);
    const results = await Promise.all([create(auth, product._id), create(auth, product._id)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await Review.countDocuments({ product: product._id })).toBe(1);
  });
});

describe('Unexpected database errors', () => {
  afterEach(() => jest.restoreAllMocks());

  it('a save error other than "duplicate" is NOT turned into 409 (it becomes a 500)', async () => {
    const product = await createProduct();
    const { auth } = await buyer(product);
    jest.spyOn(Review, 'create').mockRejectedValueOnce(new Error('disk full'));
    const res = await create(auth, product._id);
    expect(res.status).toBe(500);
    expect(await Review.countDocuments()).toBe(0);
  });
});

describe('Rating aggregation on the product (exact values)', () => {
  it('averages visible reviews to one decimal and counts them', async () => {
    const product = await createProduct();
    expect(await ratingOf(product)).toEqual({ average: 0, count: 0 });

    const a = await buyer(product);
    const b = await buyer(product);
    const c = await buyer(product);
    await create(a.auth, product._id, validReview({ rating: 5 }));
    expect(await ratingOf(product)).toEqual({ average: 5, count: 1 });
    await create(b.auth, product._id, validReview({ rating: 4 }));
    expect(await ratingOf(product)).toEqual({ average: 4.5, count: 2 });
    await create(c.auth, product._id, validReview({ rating: 4 }));
    // (5 + 4 + 4) / 3 = 4.333… → 4.3
    expect(await ratingOf(product)).toEqual({ average: 4.3, count: 3 });
  });

  it('rounds to one decimal: (5 + 5 + 4) / 3 = 4.666… → 4.7', async () => {
    const product = await createProduct();
    for (const rating of [5, 5, 4]) {
      const { user } = await loggedIn();
      await createReview(user, product, { rating });
    }
    expect(await ratingOf(product)).toEqual({ average: 4.7, count: 3 });
  });

  it('recalculates after edit, hide, show and delete', async () => {
    const product = await createProduct();
    const admin = bearer(await createAdmin());
    const a = await buyer(product);
    const b = await buyer(product);
    const reviewA = (await create(a.auth, product._id, validReview({ rating: 5 }))).body.data;
    await create(b.auth, product._id, validReview({ rating: 3 }));
    expect(await ratingOf(product)).toEqual({ average: 4, count: 2 });

    await update(a.auth, reviewA._id, validReview({ rating: 2 })); // edit: (2 + 3) / 2
    expect(await ratingOf(product)).toEqual({ average: 2.5, count: 2 });

    await setVisibility(admin, reviewA._id, false); // hide: only the 3 counts
    expect(await ratingOf(product)).toEqual({ average: 3, count: 1 });

    await setVisibility(admin, reviewA._id, true); // show again
    expect(await ratingOf(product)).toEqual({ average: 2.5, count: 2 });

    await remove(a.auth, reviewA._id); // delete
    expect(await ratingOf(product)).toEqual({ average: 3, count: 1 });
  });

  it('goes back to 0 / 0 when the last review is deleted', async () => {
    const product = await createProduct();
    const { auth } = await buyer(product);
    const { body } = await create(auth, product._id);
    await remove(auth, body.data._id);
    expect(await ratingOf(product)).toEqual({ average: 0, count: 0 });
  });

  it('never mixes ratings of different products', async () => {
    const mug = await createProduct();
    const kettle = await createProduct();
    const { user } = await loggedIn();
    await createReview(user, mug, { rating: 5 });
    await createReview(user, kettle, { rating: 1 });
    expect(await ratingOf(mug)).toEqual({ average: 5, count: 1 });
    expect(await ratingOf(kettle)).toEqual({ average: 1, count: 1 });
  });
});

describe('PUT /api/reviews/:id', () => {
  it('lets the author edit rating, title and comment', async () => {
    const product = await createProduct();
    const { user, auth } = await loggedIn();
    const review = await createReview(user, product, { rating: 5 });

    const res = await update(auth, review._id, validReview({ rating: 3, title: 'Changed mind' }));
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Review updated');
    expect(res.body.data).toMatchObject({ rating: 3, title: 'Changed mind' });
    expect(await ratingOf(product)).toEqual({ average: 3, count: 1 });
  });

  it('an empty title removes the headline', async () => {
    const product = await createProduct();
    const { user, auth } = await loggedIn();
    const review = await createReview(user, product);
    const res = await update(auth, review._id, validReview({ title: '' }));
    expect(res.status).toBe(200);
    expect(res.body.data.title).toBeUndefined();
    expect((await Review.findById(review._id)).title).toBeUndefined();
  });

  it('cannot un-hide or move a review through the body (mass assignment)', async () => {
    const product = await createProduct();
    const other = await createProduct();
    const { user, auth } = await loggedIn();
    const review = await createReview(user, product, { isVisible: false });
    const res = await update(
      auth,
      review._id,
      validReview({ isVisible: true, product: String(other._id) }),
    );
    expect(res.status).toBe(200);
    expect(res.body.data.isVisible).toBe(false);
    expect(res.body.data.product).toBe(String(product._id));
  });

  it('returns 400 for invalid input and for an invalid id', async () => {
    const product = await createProduct();
    const { user, auth } = await loggedIn();
    const review = await createReview(user, product);
    expect((await update(auth, review._id, validReview({ rating: 9 }))).status).toBe(400);
    expect((await update(auth, review._id, validReview({ comment: 'short' }))).status).toBe(400);
    expect((await update(auth, 'abc')).status).toBe(400);
  });

  it("returns 404 for someone else's review (and leaves it unchanged)", async () => {
    const product = await createProduct();
    const author = await loggedIn();
    const review = await createReview(author.user, product, { rating: 5 });
    const intruder = await loggedIn();

    const res = await update(intruder.auth, review._id, validReview({ rating: 1 }));
    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Review not found');
    expect((await Review.findById(review._id)).rating).toBe(5);
    expect(await ratingOf(product)).toEqual({ average: 5, count: 1 });
  });

  it('returns 404 for a review that does not exist', async () => {
    const { auth } = await loggedIn();
    expect((await update(auth, missingId())).status).toBe(404);
  });
});

describe('DELETE /api/reviews/:id', () => {
  it('lets the author delete their review', async () => {
    const product = await createProduct();
    const { user, auth } = await loggedIn();
    const review = await createReview(user, product);
    const res = await remove(auth, review._id);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, message: 'Review deleted', data: null });
    expect(await Review.findById(review._id)).toBeNull();
  });

  it('lets an admin delete ANY review (moderation)', async () => {
    const product = await createProduct();
    const { user } = await loggedIn();
    const review = await createReview(user, product);
    const admin = await createAdmin();
    expect((await remove(bearer(admin), review._id)).status).toBe(200);
    expect(await Review.countDocuments()).toBe(0);
    expect(await ratingOf(product)).toEqual({ average: 0, count: 0 });
  });

  it("returns 404 for someone else's review (and keeps it)", async () => {
    const product = await createProduct();
    const author = await loggedIn();
    const review = await createReview(author.user, product);
    const intruder = await loggedIn();
    expect((await remove(intruder.auth, review._id)).status).toBe(404);
    expect(await Review.findById(review._id)).not.toBeNull();
  });

  it('returns 404 for a missing review and 400 for an invalid id', async () => {
    const { auth } = await loggedIn();
    expect((await remove(auth, missingId())).status).toBe(404);
    expect((await remove(auth, 'abc')).status).toBe(400);
  });

  it('after deleting, the customer may review the product again', async () => {
    const product = await createProduct();
    const { auth } = await buyer(product);
    const first = await create(auth, product._id);
    await remove(auth, first.body.data._id);
    expect((await create(auth, product._id)).status).toBe(201);
  });
});

describe('GET /api/reviews/admin (moderation list)', () => {
  async function seed() {
    const mug = await createProduct({ name: 'Blue Mug' });
    const kettle = await createProduct();
    const a = await loggedIn({ name: 'Ayesha' });
    const b = await loggedIn();
    await createReview(a.user, mug, { rating: 1 });
    await createReview(b.user, mug, { rating: 5, isVisible: false });
    await createReview(a.user, kettle, { rating: 5 });
    return { mug, a };
  }

  it('lists every review (visible AND hidden) with author email and product', async () => {
    const { a } = await seed();
    const admin = bearer(await createAdmin());
    const res = await adminList(admin);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(3);
    expect(res.body.meta).toEqual({ page: 1, limit: 20, total: 3, pages: 1 });
    const oldest = res.body.data[2];
    expect(oldest.user).toMatchObject({ name: 'Ayesha', email: a.user.email });
    expect(oldest.product).toMatchObject({ name: 'Blue Mug', slug: 'blue-mug' });
  });

  it('filters by rating, visibility and product', async () => {
    const { mug } = await seed();
    const admin = bearer(await createAdmin());
    expect((await adminList(admin, '?rating=1')).body.data).toHaveLength(1);
    expect((await adminList(admin, '?visibility=hidden')).body.data).toHaveLength(1);
    expect((await adminList(admin, '?visibility=visible')).body.data).toHaveLength(2);
    expect((await adminList(admin, `?product=${mug._id}`)).body.data).toHaveLength(2);
    const combined = await adminList(admin, `?product=${mug._id}&rating=5&visibility=hidden`);
    expect(combined.body.data).toHaveLength(1);
    expect((await adminList(admin, '?limit=1&page=3')).body.meta).toEqual({
      page: 3,
      limit: 1,
      total: 3,
      pages: 3,
    });
  });

  it.each([
    ['?rating=9', 'rating'],
    ['?visibility=maybe', 'visibility'],
    ['?product=abc', 'product'],
  ])('returns 400 for a bad filter %s', async (query, field) => {
    const admin = bearer(await createAdmin());
    const res = await adminList(admin, query);
    expect(res.status).toBe(400);
    expect(res.body.errors[0].field).toBe(field);
  });
});

describe('PATCH /api/reviews/:id/visibility (moderation)', () => {
  it('hides a review from the public list, then shows it again', async () => {
    const product = await createProduct();
    const { user } = await loggedIn();
    const review = await createReview(user, product);
    const admin = bearer(await createAdmin());

    const hidden = await setVisibility(admin, review._id, false);
    expect(hidden.status).toBe(200);
    expect(hidden.body.message).toBe('Review hidden');
    expect(hidden.body.data.isVisible).toBe(false);
    expect((await list(product._id)).body.data).toHaveLength(0);

    const shown = await setVisibility(admin, review._id, 'true'); // string → boolean
    expect(shown.body.message).toBe('Review is visible');
    expect((await list(product._id)).body.data).toHaveLength(1);
  });

  it('returns 400 for a missing/invalid isVisible and for an invalid id', async () => {
    const admin = bearer(await createAdmin());
    const res = await api()
      .patch(`/api/reviews/${missingId()}/visibility`)
      .set('Authorization', admin)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.errors[0].field).toBe('isVisible');
    expect((await setVisibility(admin, missingId(), 'hide')).status).toBe(400);
    expect((await setVisibility(admin, 'abc', false)).status).toBe(400);
  });

  it('returns 404 for a review that does not exist', async () => {
    const admin = bearer(await createAdmin());
    const res = await setVisibility(admin, missingId(), false);
    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Review not found');
  });
});

describe('Full journey over HTTP: buy → deliver → review', () => {
  it('admin adds a product, customer orders it, it is delivered, customer reviews it', async () => {
    const adminAuth = bearer(await createAdmin());
    // Admin creates the catalogue
    const category = await api()
      .post('/api/categories')
      .set('Authorization', adminAuth)
      .send({ name: 'Kitchen' });
    const product = await api()
      .post('/api/products')
      .set('Authorization', adminAuth)
      .send({
        name: 'Steel Kettle',
        description: 'A shiny steel kettle that boils water fast.',
        sku: 'KET-001',
        price: 2500,
        stock: 5,
        category: category.body.data._id,
        images: [{ url: 'https://res.cloudinary.com/demo/image/upload/kettle.jpg', publicId: 'k' }],
      });
    expect(product.status).toBe(201);
    const productId = product.body.data._id;

    // Customer: address → cart → COD order
    const { auth } = await loggedIn();
    const address = await api()
      .post('/api/addresses')
      .set('Authorization', auth)
      .send(validAddress());
    await api().post('/api/cart/items').set('Authorization', auth).send({ productId, quantity: 1 });
    const order = await api()
      .post('/api/orders')
      .set('Authorization', auth)
      .send({ addressId: address.body.data._id, paymentMethod: 'COD' });
    expect(order.status).toBe(201);

    // Not delivered yet → the review is refused
    expect((await create(auth, productId)).status).toBe(403);

    // Admin moves the order through every valid status to delivered
    for (const status of ['confirmed', 'processing', 'shipped', 'delivered']) {
      const res = await api()
        .patch(`/api/admin/orders/${order.body.data._id}/status`)
        .set('Authorization', adminAuth)
        .send({ status, trackingNumber: 'TRK-42' });
      expect(res.status).toBe(200);
    }

    // Now the review is accepted and shows on the product
    const review = await create(auth, productId, validReview({ rating: 5 }));
    expect(review.status).toBe(201);
    expect(review.body.data.order).toBe(order.body.data._id);
    const reviews = await list(productId);
    expect(reviews.body.data).toHaveLength(1);
    const page = await api().get(`/api/products/${product.body.data.slug}`);
    expect(page.body.data).toMatchObject({ ratingAverage: 5, ratingCount: 1 });
  });
});
