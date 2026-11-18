/**
 * INTEGRATION tests for /api/auth/*.
 *
 * Integration = test many pieces TOGETHER: route → middleware → controller → service
 * → model → (in-memory) MongoDB, through real HTTP requests made by Supertest.
 * Each `describe` block is one endpoint; each `it` is one behaviour we promise.
 */
import jwt from 'jsonwebtoken';
import { connectTestDB, clearTestDB, closeTestDB } from '../helpers/db.js';
import {
  api,
  createUser,
  createAdmin,
  bearer,
  loggedIn,
  uniqueEmail,
  tokenFromLastEmail,
  PASSWORD,
} from '../helpers/factories.js';
import { User } from '../../src/modules/models.js';
import { outbox } from '../../src/emails/sendEmail.js';

beforeAll(connectTestDB);
afterEach(clearTestDB);
afterAll(closeTestDB);

describe('POST /api/auth/register', () => {
  const valid = () => ({ name: 'Ali Khan', email: uniqueEmail(), password: PASSWORD });

  it('creates a customer, returns a token and sends a verification email', async () => {
    const input = valid();
    const res = await api().post('/api/auth/register').send(input);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toEqual(expect.any(String));
    expect(res.body.data.user).toMatchObject({
      name: 'Ali Khan',
      email: input.email,
      role: 'customer',
      isEmailVerified: false,
    });
    // The password (even hashed) must never be in a response
    expect(res.body.data.user.password).toBeUndefined();
    // One verification email with a token link
    expect(outbox).toHaveLength(1);
    expect(tokenFromLastEmail(input.email)).toMatch(/^[a-f0-9]{64}$/);
  });

  it('stores the password hashed, never as plain text', async () => {
    const input = valid();
    await api().post('/api/auth/register').send(input);
    const saved = await User.findOne({ email: input.email }).select('+password');
    expect(saved.password).not.toBe(PASSWORD);
    expect(saved.password).toMatch(/^\$2[aby]\$/); // bcrypt hash prefix
  });

  it('ignores role/isEmailVerified sent by the client (mass-assignment protection)', async () => {
    const input = { ...valid(), role: 'admin', isEmailVerified: true };
    const res = await api().post('/api/auth/register').send(input);
    expect(res.status).toBe(201);
    expect(res.body.data.user.role).toBe('customer');
    expect(res.body.data.user.isEmailVerified).toBe(false);
  });

  it('normalises the email to lowercase', async () => {
    const res = await api()
      .post('/api/auth/register')
      .send({ ...valid(), email: '  Ali.KHAN@Example.COM ' });
    expect(res.body.data.user.email).toBe('ali.khan@example.com');
  });

  it('returns 409 when the email is already registered', async () => {
    const existing = await createUser();
    const res = await api()
      .post('/api/auth/register')
      .send({ ...valid(), email: existing.email });
    expect(res.status).toBe(409);
    expect(res.body.errors[0].field).toBe('email');
  });

  it.each([
    ['missing name', { name: undefined }, 'name'],
    ['short name', { name: 'A' }, 'name'],
    ['bad email', { email: 'nope' }, 'email'],
    ['short password', { password: 'abc1' }, 'password'],
    ['password without a number', { password: 'abcdefgh' }, 'password'],
    ['password without a letter', { password: '12345678' }, 'password'],
  ])('returns 400 for %s', async (_label, change, field) => {
    const res = await api()
      .post('/api/auth/register')
      .send({ ...valid(), ...change });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Validation failed');
    expect(res.body.errors.map((e) => e.field)).toContain(field);
  });

  it('returns 400 for a body that is not valid JSON', async () => {
    const res = await api()
      .post('/api/auth/register')
      .set('Content-Type', 'application/json')
      .send('{"name": ');
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Invalid JSON body');
  });
});

describe('POST /api/auth/login', () => {
  it('logs in with the right email and password', async () => {
    const user = await createUser();
    const res = await api().post('/api/auth/login').send({ email: user.email, password: PASSWORD });

    expect(res.status).toBe(200);
    const payload = jwt.verify(res.body.data.token, process.env.JWT_SECRET);
    expect(payload).toMatchObject({ id: user._id.toString(), role: 'customer' });
    // lastLoginAt is recorded
    expect((await User.findById(user._id)).lastLoginAt).toBeInstanceOf(Date);
  });

  it('gives the SAME 401 message for a wrong password and an unknown email', async () => {
    const user = await createUser();
    const wrongPassword = await api()
      .post('/api/auth/login')
      .send({ email: user.email, password: 'wrong123' });
    const unknownEmail = await api()
      .post('/api/auth/login')
      .send({ email: 'nobody@test.com', password: PASSWORD });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body.message).toBe(unknownEmail.body.message); // no user enumeration
  });

  it('returns 403 for a disabled account', async () => {
    const user = await createUser({ isActive: false });
    const res = await api().post('/api/auth/login').send({ email: user.email, password: PASSWORD });
    expect(res.status).toBe(403);
  });

  it('returns 400 when the password is missing', async () => {
    const res = await api().post('/api/auth/login').send({ email: 'a@b.co' });
    expect(res.status).toBe(400);
  });

  it('blocks NoSQL-injection attempts like { "$ne": null }', async () => {
    await createUser();
    const res = await api()
      .post('/api/auth/login')
      .send({ email: { $ne: null }, password: { $ne: null } });
    expect(res.status).toBe(400); // sanitised to {} → fails validation, never logs anyone in
  });

  it('lets an admin log in through the normal login too', async () => {
    const admin = await createAdmin();
    const res = await api()
      .post('/api/auth/login')
      .send({ email: admin.email, password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.data.user.role).toBe('admin');
  });
});

describe('POST /api/auth/admin/login', () => {
  it('logs in an admin', async () => {
    const admin = await createAdmin();
    const res = await api()
      .post('/api/auth/admin/login')
      .send({ email: admin.email, password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.data.user.role).toBe('admin');
  });

  it('refuses customers with 403', async () => {
    const user = await createUser();
    const res = await api()
      .post('/api/auth/admin/login')
      .send({ email: user.email, password: PASSWORD });
    expect(res.status).toBe(403);
    expect(res.body.message).toBe('Admin access only');
  });

  it('returns 401 for a wrong admin password', async () => {
    const admin = await createAdmin();
    const res = await api()
      .post('/api/auth/admin/login')
      .send({ email: admin.email, password: 'wrong123' });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/auth/me (the protect middleware)', () => {
  it('returns the current user for a valid token', async () => {
    const { user, auth } = await loggedIn();
    const res = await api().get('/api/auth/me').set('Authorization', auth);
    expect(res.status).toBe(200);
    expect(res.body.data._id).toBe(user._id.toString());
    expect(res.body.data.password).toBeUndefined();
  });

  it('returns 401 without a token', async () => {
    const res = await api().get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Not authorised, token missing');
  });

  it('returns 401 when the header is not "Bearer <token>"', async () => {
    const res = await api().get('/api/auth/me').set('Authorization', 'Token abc');
    expect(res.status).toBe(401);
  });

  it('returns 401 for a token signed with another secret (forged)', async () => {
    const user = await createUser();
    const forged = jwt.sign({ id: user._id.toString(), role: 'admin' }, 'not-our-secret');
    const res = await api().get('/api/auth/me').set('Authorization', `Bearer ${forged}`);
    expect(res.status).toBe(401);
  });

  it('returns 401 for an expired token', async () => {
    const user = await createUser();
    const expired = jwt.sign(
      { id: user._id.toString(), role: 'customer' },
      process.env.JWT_SECRET,
      {
        expiresIn: -10, // already expired 10 seconds ago
      },
    );
    const res = await api().get('/api/auth/me').set('Authorization', `Bearer ${expired}`);
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Not authorised, token invalid or expired');
  });

  it('returns 401 when the user was deleted after the token was issued', async () => {
    const { user, auth } = await loggedIn();
    await User.deleteOne({ _id: user._id });
    const res = await api().get('/api/auth/me').set('Authorization', auth);
    expect(res.status).toBe(401);
  });

  it('returns 403 when the account was disabled after the token was issued', async () => {
    const { user, auth } = await loggedIn();
    await User.updateOne({ _id: user._id }, { isActive: false });
    const res = await api().get('/api/auth/me').set('Authorization', auth);
    expect(res.status).toBe(403);
  });
});

describe('POST /api/auth/logout', () => {
  it('returns 200 for a logged-in user', async () => {
    const { auth } = await loggedIn();
    const res = await api().post('/api/auth/logout').set('Authorization', auth);
    expect(res.status).toBe(200);
  });

  it('requires a token', async () => {
    expect((await api().post('/api/auth/logout')).status).toBe(401);
  });
});

describe('Email verification flow', () => {
  it('register → read token from email → verify → user is verified', async () => {
    const email = uniqueEmail();
    await api().post('/api/auth/register').send({ name: 'Sara', email, password: PASSWORD });
    const token = tokenFromLastEmail(email);

    const res = await api().post('/api/auth/verify-email').send({ token });
    expect(res.status).toBe(200);
    expect(res.body.data.isEmailVerified).toBe(true);
  });

  it('the same link cannot be used twice', async () => {
    const email = uniqueEmail();
    await api().post('/api/auth/register').send({ name: 'Sara', email, password: PASSWORD });
    const token = tokenFromLastEmail(email);
    await api().post('/api/auth/verify-email').send({ token });

    const again = await api().post('/api/auth/verify-email').send({ token });
    expect(again.status).toBe(400);
  });

  it('rejects an expired link', async () => {
    const email = uniqueEmail();
    await api().post('/api/auth/register').send({ name: 'Sara', email, password: PASSWORD });
    const token = tokenFromLastEmail(email);
    // Move the expiry date into the past, as if 24 hours had gone by
    await User.updateOne({ email }, { emailVerifyExpires: new Date(Date.now() - 1000) });

    const res = await api().post('/api/auth/verify-email').send({ token });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Verification link is invalid or has expired');
  });

  it('rejects a made-up token and a missing token', async () => {
    expect(
      (
        await api()
          .post('/api/auth/verify-email')
          .send({ token: 'a'.repeat(64) })
      ).status,
    ).toBe(400);
    expect((await api().post('/api/auth/verify-email').send({})).status).toBe(400);
  });
});

describe('POST /api/auth/resend-verification', () => {
  it('sends a new email whose token works (the old one no longer does)', async () => {
    const email = uniqueEmail();
    const reg = await api()
      .post('/api/auth/register')
      .send({ name: 'Sara', email, password: PASSWORD });
    const oldToken = tokenFromLastEmail(email);

    const res = await api()
      .post('/api/auth/resend-verification')
      .set('Authorization', `Bearer ${reg.body.data.token}`);
    expect(res.status).toBe(200);

    const newToken = tokenFromLastEmail(email);
    expect(newToken).not.toBe(oldToken);
    expect((await api().post('/api/auth/verify-email').send({ token: oldToken })).status).toBe(400);
    expect((await api().post('/api/auth/verify-email').send({ token: newToken })).status).toBe(200);
  });

  it('returns 400 if the email is already verified', async () => {
    const { auth } = await loggedIn({ isEmailVerified: true });
    const res = await api().post('/api/auth/resend-verification').set('Authorization', auth);
    expect(res.status).toBe(400);
  });

  it('requires a token', async () => {
    expect((await api().post('/api/auth/resend-verification')).status).toBe(401);
  });
});

describe('Forgot / reset password flow', () => {
  it('forgot → token from email → reset → login with the new password', async () => {
    const user = await createUser();
    const forgot = await api().post('/api/auth/forgot-password').send({ email: user.email });
    expect(forgot.status).toBe(200);

    const token = tokenFromLastEmail(user.email);
    const reset = await api()
      .post('/api/auth/reset-password')
      .send({ token, password: 'newpass123' });
    expect(reset.status).toBe(200);

    // A "password changed" notice was emailed
    expect(outbox.at(-1).subject).toMatch(/password was changed/);
    // Old password fails, new one works
    expect(
      (await api().post('/api/auth/login').send({ email: user.email, password: PASSWORD })).status,
    ).toBe(401);
    expect(
      (await api().post('/api/auth/login').send({ email: user.email, password: 'newpass123' }))
        .status,
    ).toBe(200);
  });

  it('answers the same for unknown emails and sends nothing', async () => {
    const res = await api().post('/api/auth/forgot-password').send({ email: 'ghost@test.com' });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/If an account exists/);
    expect(outbox).toHaveLength(0);
  });

  it('sends nothing to Google-only accounts', async () => {
    const user = await createUser({ authProvider: 'google', password: undefined });
    await api().post('/api/auth/forgot-password').send({ email: user.email });
    expect(outbox).toHaveLength(0);
  });

  it('logs out old sessions: tokens issued before the reset stop working', async () => {
    const { user, auth } = await loggedIn();
    await api().post('/api/auth/forgot-password').send({ email: user.email });
    const token = tokenFromLastEmail(user.email);
    await api().post('/api/auth/reset-password').send({ token, password: 'newpass123' });

    const res = await api().get('/api/auth/me').set('Authorization', auth);
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Password was changed, please log in again');
  });

  it('rejects a reset link that is used twice or expired', async () => {
    const user = await createUser();
    await api().post('/api/auth/forgot-password').send({ email: user.email });
    const token = tokenFromLastEmail(user.email);
    await api().post('/api/auth/reset-password').send({ token, password: 'newpass123' });

    const twice = await api()
      .post('/api/auth/reset-password')
      .send({ token, password: 'other1234' });
    expect(twice.status).toBe(400);

    await api().post('/api/auth/forgot-password').send({ email: user.email });
    const token2 = tokenFromLastEmail(user.email);
    await User.updateOne({ _id: user._id }, { passwordResetExpires: new Date(Date.now() - 1000) });
    const expired = await api()
      .post('/api/auth/reset-password')
      .send({ token: token2, password: 'other1234' });
    expect(expired.status).toBe(400);
  });

  it('validates the new password', async () => {
    const res = await api()
      .post('/api/auth/reset-password')
      .send({ token: 'a'.repeat(64), password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.errors[0].field).toBe('password');
  });

  it('validates the email on forgot-password', async () => {
    expect((await api().post('/api/auth/forgot-password').send({ email: 'x' })).status).toBe(400);
  });
});

describe('Bearer helper sanity check', () => {
  it('a token from the factory works with protect', async () => {
    const user = await createUser();
    const res = await api().get('/api/auth/me').set('Authorization', bearer(user));
    expect(res.status).toBe(200);
  });
});
