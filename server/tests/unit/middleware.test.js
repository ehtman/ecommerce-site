/**
 * UNIT tests for middleware that needs no database: authorize, requireVerifiedEmail,
 * validate, notFound and the central error handler.
 *
 * Trick: middleware is just a function (req, res, next). We call it with fake objects
 * and check what it passed to next() or what it wrote to res.
 */
import { body } from 'express-validator';
import { authorize, requireVerifiedEmail } from '../../src/middleware/auth.middleware.js';
import { validate } from '../../src/middleware/validate.middleware.js';
import notFound from '../../src/middleware/notFound.middleware.js';
import errorHandler from '../../src/middleware/error.middleware.js';
import ApiError from '../../src/utils/ApiError.js';

// Runs a middleware and resolves with whatever it passed to next() (undefined = allowed)
const run = (mw, req) => new Promise((resolve) => mw(req, {}, (err) => resolve(err)));

// A fake Express `res` that records the status and JSON body
const fakeRes = () => {
  const res = {};
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body) => {
    res.body = body;
    return res;
  };
  return res;
};

describe('authorize(...roles)', () => {
  it('lets listed roles through', async () => {
    expect(await run(authorize('admin'), { user: { role: 'admin' } })).toBeUndefined();
    expect(
      await run(authorize('admin', 'customer'), { user: { role: 'customer' } }),
    ).toBeUndefined();
  });

  it('blocks other roles with 403', async () => {
    const err = await run(authorize('admin'), { user: { role: 'customer' } });
    expect(err).toBeInstanceOf(ApiError);
    expect(err.statusCode).toBe(403);
  });
});

describe('requireVerifiedEmail', () => {
  it('blocks unverified customers', async () => {
    const err = await run(requireVerifiedEmail, {
      user: { role: 'customer', isEmailVerified: false },
    });
    expect(err.statusCode).toBe(403);
  });

  it('allows verified customers and all admins', async () => {
    expect(
      await run(requireVerifiedEmail, { user: { role: 'customer', isEmailVerified: true } }),
    ).toBeUndefined();
    expect(
      await run(requireVerifiedEmail, { user: { role: 'admin', isEmailVerified: false } }),
    ).toBeUndefined();
  });
});

describe('validate(rules)', () => {
  const rules = [body('name').isString().withMessage('Name is required')];

  it('calls next() with no error when input is valid', async () => {
    expect(await run(validate(rules), { body: { name: 'Ali' } })).toBeUndefined();
  });

  it('returns a 400 ApiError listing the failed fields', async () => {
    const err = await run(validate(rules), { body: {} });
    expect(err.statusCode).toBe(400);
    expect(err.errors).toEqual([{ field: 'name', message: 'Name is required' }]);
  });
});

describe('notFound', () => {
  it('creates a 404 error naming the route', async () => {
    const err = await run(notFound, { method: 'GET', originalUrl: '/api/nope' });
    expect(err.statusCode).toBe(404);
    expect(err.message).toBe('Route not found: GET /api/nope');
  });
});

describe('errorHandler', () => {
  const handle = (err) => {
    const res = fakeRes();
    errorHandler(err, {}, res, () => {});
    return res;
  };

  it('uses ApiError status, message and field errors', () => {
    const res = handle(new ApiError(409, 'Taken', [{ field: 'email', message: 'Taken' }]));
    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({
      success: false,
      message: 'Taken',
      errors: [{ field: 'email', message: 'Taken' }],
    });
  });

  it('turns Mongoose ValidationError into 400 with field errors', () => {
    const err = { name: 'ValidationError', errors: { name: { path: 'name', message: 'Bad' } } };
    const res = handle(err);
    expect(res.statusCode).toBe(400);
    expect(res.body.errors).toEqual([{ field: 'name', message: 'Bad' }]);
  });

  it('turns CastError (bad id) into 400', () => {
    const res = handle({ name: 'CastError', path: '_id' });
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe('Invalid _id');
  });

  it('turns duplicate-key errors into 409', () => {
    const res = handle({ code: 11000, keyValue: { email: 'a@b.co' } });
    expect(res.statusCode).toBe(409);
    expect(res.body.message).toBe('email already exists');
  });

  it('turns duplicate-key errors without keyValue into a generic 409', () => {
    expect(handle({ code: 11000 }).body.message).toBe('value already exists');
  });

  it('turns broken JSON bodies into 400', () => {
    const res = handle({ type: 'entity.parse.failed', status: 400 });
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe('Invalid JSON body');
  });

  it('turns unknown errors into 500 and includes the stack outside production', () => {
    const res = handle(new Error('boom'));
    expect(res.statusCode).toBe(500);
    expect(res.body.stack).toBeDefined();
  });

  it('uses a default message when the error has none', () => {
    const res = handle({});
    expect(res.statusCode).toBe(500);
    expect(res.body.message).toBe('Something went wrong');
  });
});
