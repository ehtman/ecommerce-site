/**
 * INTEGRATION tests for POST /api/auth/google.
 *
 * We never call Google in tests. Instead we replace googleVerifier.verify with a fake
 * that returns whatever payload the test needs (this kind of fake is called a "stub").
 * That keeps tests fast, offline and predictable, and still runs all OUR logic.
 */
import { connectTestDB, clearTestDB, closeTestDB } from '../helpers/db.js';
import { api, createUser, createAdmin } from '../helpers/factories.js';
import { googleVerifier } from '../../src/modules/auth/google.verifier.js';
import { User } from '../../src/modules/models.js';
import env from '../../src/config/env.js';

const realVerify = googleVerifier.verify; // keep the original to restore after each test

// Make the fake Google return this payload
const googleSays = (payload) => {
  googleVerifier.verify = async () => payload;
};
const payloadFor = (email, extra = {}) => ({
  sub: `google-${email}`, // Google's id for the person
  email,
  email_verified: true,
  name: 'Google Person',
  ...extra,
});

beforeAll(connectTestDB);
afterEach(async () => {
  googleVerifier.verify = realVerify;
  await clearTestDB();
});
afterAll(closeTestDB);

const login = () => api().post('/api/auth/google').send({ credential: 'fake-id-token' });

describe('POST /api/auth/google', () => {
  it('creates a new verified customer on first sign-in', async () => {
    googleSays(payloadFor('new@gmail.com'));
    const res = await login();

    expect(res.status).toBe(200);
    expect(res.body.data.token).toEqual(expect.any(String));
    expect(res.body.data.user).toMatchObject({
      email: 'new@gmail.com',
      role: 'customer',
      authProvider: 'google',
      isEmailVerified: true,
    });
  });

  it('logs the same person in again (found by googleId), without duplicates', async () => {
    googleSays(payloadFor('again@gmail.com'));
    await login();
    const res = await login();
    expect(res.status).toBe(200);
    expect(await User.countDocuments({ email: 'again@gmail.com' })).toBe(1);
  });

  it('links Google to an existing email+password account and verifies it', async () => {
    const user = await createUser({ email: 'linked@gmail.com', isEmailVerified: false });
    googleSays(payloadFor('linked@gmail.com'));

    const res = await login();
    expect(res.status).toBe(200);
    const fresh = await User.findById(user._id);
    expect(fresh.googleId).toBe('google-linked@gmail.com');
    expect(fresh.isEmailVerified).toBe(true);
  });

  it('uses the email name when Google sends no name', async () => {
    googleSays(payloadFor('noname@gmail.com', { name: undefined }));
    const res = await login();
    expect(res.body.data.user.name).toBe('noname');
  });

  it('refuses admins (they must use email + password)', async () => {
    await createAdmin({ email: 'boss@gmail.com' });
    googleSays(payloadFor('boss@gmail.com'));
    expect((await login()).status).toBe(403);
  });

  it('refuses an admin already linked by googleId', async () => {
    await createAdmin({ email: 'boss2@gmail.com', googleId: 'google-boss2@gmail.com' });
    googleSays(payloadFor('boss2@gmail.com'));
    expect((await login()).status).toBe(403);
  });

  it('refuses a disabled account', async () => {
    await createUser({ email: 'off@gmail.com', isActive: false });
    googleSays(payloadFor('off@gmail.com'));
    expect((await login()).status).toBe(403);
  });

  it('returns 401 when Google says the token is invalid', async () => {
    googleVerifier.verify = async () => {
      throw new Error('Wrong recipient');
    };
    const res = await login();
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid Google credential');
  });

  it('returns 401 when the Google email is not verified', async () => {
    googleSays(payloadFor('unverified@gmail.com', { email_verified: false }));
    expect((await login()).status).toBe(401);
  });

  it('returns 400 without a credential', async () => {
    expect((await api().post('/api/auth/google').send({})).status).toBe(400);
  });

  it('returns 500 "not configured" when GOOGLE_CLIENT_ID is empty', async () => {
    const saved = env.GOOGLE_CLIENT_ID;
    env.GOOGLE_CLIENT_ID = '';
    try {
      const res = await login();
      expect(res.status).toBe(500);
      expect(res.body.message).toBe('Google login is not configured');
    } finally {
      env.GOOGLE_CLIENT_ID = saved;
    }
  });

  it('the real verifier rejects a fake token (no network needed to fail)', async () => {
    await expect(realVerify('not-a-real-jwt')).rejects.toThrow();
  });
});
