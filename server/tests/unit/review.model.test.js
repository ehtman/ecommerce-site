/**
 * UNIT tests for the Review model's schema rules, its index definitions, the REVIEW
 * constants and the review validation rules. No database needed:
 *  - `validateSync()` runs the schema validators in memory
 *  - validation rules are run through validate() with a fake `req`
 * (The rating aggregation needs MongoDB, so it is tested in integration/reviews.test.js.)
 */
import mongoose from 'mongoose';
import { Review } from '../../src/modules/models.js';
import { REVIEW } from '../../src/config/constants.js';
import { validate } from '../../src/middleware/validate.middleware.js';
import {
  reviewRules,
  visibilityRules,
  adminListRules,
} from '../../src/modules/reviews/review.validation.js';

const id = () => new mongoose.Types.ObjectId();
const valid = (overrides = {}) =>
  new Review({
    user: id(),
    product: id(),
    order: id(),
    rating: 4,
    comment: 'Exactly as described and arrived quickly.',
    ...overrides,
  });

// Runs a list of rules through validate() and resolves with the error (undefined = valid)
const check = (rules, req) =>
  new Promise((resolve) => {
    validate(rules)({ body: {}, query: {}, params: {}, ...req }, {}, resolve);
  });

describe('Review model', () => {
  it('accepts a valid review and is visible by default', () => {
    const review = valid();
    expect(review.validateSync()).toBeUndefined();
    expect(review.isVisible).toBe(true);
  });

  it('requires the author, product, proof order, rating and comment', () => {
    const { errors } = new Review({}).validateSync();
    ['user', 'product', 'order', 'rating', 'comment'].forEach((field) =>
      expect(errors[field]).toBeDefined(),
    );
  });

  it.each([
    [0, 'Rating must be 1–5'],
    [6, 'Rating must be 1–5'],
    [4.5, 'Rating must be a whole number'],
  ])('rejects rating %s', (rating, message) => {
    expect(valid({ rating }).validateSync().errors.rating.message).toBe(message);
  });

  it('enforces the comment and title lengths (after trimming)', () => {
    expect(valid({ comment: '   short   ' }).validateSync().errors.comment.message).toBe(
      `Comment must be at least ${REVIEW.COMMENT_MIN} characters`,
    );
    expect(valid({ comment: 'x'.repeat(1001) }).validateSync().errors.comment).toBeDefined();
    expect(valid({ title: 'x'.repeat(81) }).validateSync().errors.title).toBeDefined();
    expect(valid({ title: '  Nice  ' }).title).toBe('Nice');
  });

  it('has the compound unique index: one review per product per customer', () => {
    const index = Review.schema
      .indexes()
      .find(([, options]) => options.name === 'one_review_per_product');
    expect(index[0]).toEqual({ product: 1, user: 1 });
    expect(index[1].unique).toBe(true);
  });

  it('has the index that serves the public list (product, visible, newest)', () => {
    const fields = Review.schema.indexes().map(([f]) => f);
    expect(fields).toContainEqual({ product: 1, isVisible: 1, createdAt: -1 });
  });

  it('hides __v in JSON', () => {
    expect(valid().toJSON().__v).toBeUndefined();
  });
});

describe('REVIEW constants', () => {
  it('are frozen and describe a 1–5 star scale', () => {
    expect(Object.isFrozen(REVIEW)).toBe(true);
    expect([REVIEW.RATING_MIN, REVIEW.RATING_MAX]).toEqual([1, 5]);
    expect(REVIEW.PAGE_SIZE).toBeLessThanOrEqual(REVIEW.MAX_PAGE_SIZE);
  });
});

describe('review validation rules', () => {
  it('accepts a full review and converts "5" to the number 5', async () => {
    const req = { body: { rating: '5', title: 'Nice', comment: '  Works really well  ' } };
    expect(await check(reviewRules, req)).toBeUndefined();
    expect(req.body.rating).toBe(5);
    expect(req.body.comment).toBe('Works really well');
  });

  it('reports one error per bad field', async () => {
    const err = await check(reviewRules, { body: { rating: 7, title: 1, comment: 'no' } });
    expect(err.statusCode).toBe(400);
    expect(err.errors.map((e) => e.field).sort()).toEqual(['comment', 'rating', 'title']);
  });

  it('visibility must be a boolean', async () => {
    const req = { body: { isVisible: 'false' } };
    expect(await check(visibilityRules, req)).toBeUndefined();
    expect(req.body.isVisible).toBe(false);
    expect((await check(visibilityRules, { body: { isVisible: 'nope' } })).statusCode).toBe(400);
  });

  it('admin list filters are optional but must be valid when sent', async () => {
    expect(await check(adminListRules, {})).toBeUndefined();
    const req = { query: { rating: '2', visibility: 'hidden', product: String(id()) } };
    expect(await check(adminListRules, req)).toBeUndefined();
    expect(req.query.rating).toBe(2);
    expect((await check(adminListRules, { query: { visibility: 'all' } })).statusCode).toBe(400);
  });
});
