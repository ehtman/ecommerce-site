/**
 * UNIT tests for validateObjectId(...names) – the guard that checks URL ids like `:id`
 * before any database query runs. Same trick as middleware.test.js: call the middleware
 * with a fake `req` and look at what it passed to next().
 */
import mongoose from 'mongoose';
import { validateObjectId } from '../../src/middleware/validate.middleware.js';
import ApiError from '../../src/utils/ApiError.js';

// Runs a middleware and resolves with whatever it passed to next() (undefined = allowed)
const run = (mw, params) => new Promise((resolve) => mw({ params }, {}, (err) => resolve(err)));
const goodId = () => new mongoose.Types.ObjectId().toString();

describe('validateObjectId', () => {
  it('lets a 24-character hex id through', async () => {
    expect(await run(validateObjectId('id'), { id: goodId() })).toBeUndefined();
  });

  it.each([
    ['a short string', 'abc'],
    ['a 24-char string that is not hex', 'zzzzzzzzzzzzzzzzzzzzzzzz'],
    // mongoose.isValidObjectId() would say "yes" to ANY 12-character string. We don't.
    ['a 12-character string', 'hello-world!'],
    ['a missing parameter', undefined],
  ])('rejects %s with 400 "Invalid id"', async (_case, id) => {
    const err = await run(validateObjectId('id'), { id });
    expect(err).toBeInstanceOf(ApiError);
    expect(err.statusCode).toBe(400);
    expect(err.message).toBe('Invalid id');
    expect(err.errors).toEqual([{ field: 'id', message: 'Invalid id' }]);
  });

  it('checks EVERY listed parameter and names the bad one', async () => {
    const mw = validateObjectId('productId', 'reviewId');
    expect(await run(mw, { productId: goodId(), reviewId: goodId() })).toBeUndefined();
    const err = await run(mw, { productId: goodId(), reviewId: 'nope' });
    expect(err.errors[0].field).toBe('reviewId');
  });
});
