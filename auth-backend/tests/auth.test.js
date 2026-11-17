// Unit tests for auth building blocks. Run with: npm test  (no database needed)
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.MONGO_URI ||= 'mongodb://localhost:27017/test';
process.env.JWT_SECRET ||= 'test-secret-test-secret-test-secret-123';

const { default: jwt } = await import('jsonwebtoken');
const { User } = await import('../src/modules/models.js');
const { authorize, requireVerifiedEmail } = await import('../src/middleware/auth.middleware.js');
const { default: generateToken } = await import('../src/utils/generateToken.js');

const run = (mw, user) => new Promise((resolve) => mw({ user }, {}, (err) => resolve(err)));

test('generateToken stores only id and role', () => {
  const user = new User({ name: 'Ali', email: 'ali@example.com', password: 'secret123' });
  const payload = jwt.verify(generateToken(user), process.env.JWT_SECRET);
  assert.equal(payload.id, user._id.toString());
  assert.equal(payload.role, 'customer');
  assert.equal(payload.email, undefined);
});

test('authorize allows listed roles and blocks others', async () => {
  assert.equal(await run(authorize('admin'), { role: 'admin' }), undefined);
  const err = await run(authorize('admin'), { role: 'customer' });
  assert.equal(err.statusCode, 403);
});

test('requireVerifiedEmail blocks unverified customers only', async () => {
  assert.equal((await run(requireVerifiedEmail, { role: 'customer', isEmailVerified: false })).statusCode, 403);
  assert.equal(await run(requireVerifiedEmail, { role: 'customer', isEmailVerified: true }), undefined);
  assert.equal(await run(requireVerifiedEmail, { role: 'admin', isEmailVerified: false }), undefined);
});

test('changedPasswordAfter invalidates older tokens', () => {
  const user = new User({ name: 'Ali', email: 'ali@example.com', password: 'x' });
  user.passwordChangedAt = new Date();
  const issuedBefore = Math.floor(Date.now() / 1000) - 60;
  const issuedAfter = Math.floor(Date.now() / 1000) + 60;
  assert.equal(user.changedPasswordAfter(issuedBefore), true);
  assert.equal(user.changedPasswordAfter(issuedAfter), false);
});

test('email-verify and reset tokens are stored hashed, not in plain text', () => {
  const user = new User({ name: 'Ali', email: 'ali@example.com', password: 'x' });
  const t1 = user.createEmailVerifyToken();
  const t2 = user.createPasswordResetToken();
  assert.notEqual(user.emailVerifyTokenHash, t1);
  assert.notEqual(user.passwordResetTokenHash, t2);
  assert.equal(user.emailVerifyTokenHash.length, 64);
  assert.ok(user.passwordResetExpires > new Date());
});
