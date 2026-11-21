/**
 * INTEGRATION tests: every new customer gets a cart and a wishlist, created in ONE
 * MongoDB transaction together with the user (auth.service.js → createUserWithCartAndWishlist).
 *
 * The rollback tests make the LAST write (or the middle one) fail on purpose with
 * jest.spyOn(...).mockRejectedValueOnce(...). If the code were not atomic, the user (and
 * maybe the cart) would stay in the database. With the transaction, NOTHING stays.
 * Our test database is a replica set (tests/setup/globalSetup.js), so transactions work.
 */
import { jest } from '@jest/globals';
import { connectTestDB, clearTestDB, closeTestDB } from '../helpers/db.js';
import { api, uniqueEmail, PASSWORD } from '../helpers/factories.js';
import { User, Cart, Wishlist } from '../../src/modules/models.js';
import { googleVerifier } from '../../src/modules/auth/google.verifier.js';
import { outbox } from '../../src/emails/sendEmail.js';

const realVerify = googleVerifier.verify;

beforeAll(connectTestDB);
afterEach(async () => {
  jest.restoreAllMocks(); // undo every spyOn, so other tests see the real functions
  googleVerifier.verify = realVerify;
  await clearTestDB();
});
afterAll(closeTestDB);

const register = (email) =>
  api().post('/api/auth/register').send({ name: 'Ali Khan', email, password: PASSWORD });

// How many documents of each kind exist for this email?
async function countsFor(email) {
  const user = await User.findOne({ email });
  if (!user) return { user: 0, cart: await Cart.countDocuments(), wishlist: 0 };
  return {
    user: 1,
    cart: await Cart.countDocuments({ user: user._id }),
    wishlist: await Wishlist.countDocuments({ user: user._id }),
  };
}

describe('Registration creates the cart and wishlist', () => {
  it('email sign-up saves the user with an empty cart and an empty wishlist', async () => {
    const email = uniqueEmail();
    const res = await register(email);
    expect(res.status).toBe(201);

    expect(await countsFor(email)).toEqual({ user: 1, cart: 1, wishlist: 1 });
    const user = await User.findOne({ email });
    expect((await Cart.findOne({ user: user._id })).items).toHaveLength(0);
    expect((await Wishlist.findOne({ user: user._id })).products).toHaveLength(0);
  });

  it('the new customer can use the cart straight away (no second cart is created)', async () => {
    const email = uniqueEmail();
    const res = await register(email);
    const auth = `Bearer ${res.body.data.token}`;
    expect((await api().get('/api/cart').set('Authorization', auth)).status).toBe(200);
    expect((await api().get('/api/wishlist').set('Authorization', auth)).status).toBe(200);
    expect(await countsFor(email)).toEqual({ user: 1, cart: 1, wishlist: 1 });
  });

  it('Google sign-up also creates the cart and wishlist', async () => {
    googleVerifier.verify = async () => ({
      sub: 'google-tx-1',
      email: 'tx@gmail.com',
      email_verified: true,
      name: 'Google Person',
    });
    const res = await api().post('/api/auth/google').send({ credential: 'fake' });
    expect(res.status).toBe(200);
    expect(await countsFor('tx@gmail.com')).toEqual({ user: 1, cart: 1, wishlist: 1 });
  });
});

describe('Transaction rollback (all or nothing)', () => {
  it('a failing wishlist write rolls back the user AND the cart', async () => {
    jest.spyOn(Wishlist, 'create').mockRejectedValueOnce(new Error('disk full'));
    const email = uniqueEmail();

    const res = await register(email);
    expect(res.status).toBe(500);
    // Nothing from this attempt is left behind
    expect(await User.countDocuments({ email })).toBe(0);
    expect(await Cart.countDocuments()).toBe(0);
    expect(await Wishlist.countDocuments()).toBe(0);
    // And no verification email went out for an account that does not exist
    expect(outbox).toHaveLength(0);
  });

  it('a failing cart write rolls back the user', async () => {
    jest.spyOn(Cart, 'create').mockRejectedValueOnce(new Error('network error'));
    const email = uniqueEmail();

    expect((await register(email)).status).toBe(500);
    expect(await User.countDocuments({ email })).toBe(0);
    expect(await Wishlist.countDocuments()).toBe(0);
  });

  it('after a rolled-back attempt the same email can register normally', async () => {
    jest.spyOn(Wishlist, 'create').mockRejectedValueOnce(new Error('temporary'));
    const email = uniqueEmail();
    await register(email);

    const res = await register(email); // the real Wishlist.create runs this time
    expect(res.status).toBe(201);
    expect(await countsFor(email)).toEqual({ user: 1, cart: 1, wishlist: 1 });
  });

  it('a failing Google sign-up leaves no user behind', async () => {
    jest.spyOn(Cart, 'create').mockRejectedValueOnce(new Error('boom'));
    googleVerifier.verify = async () => ({
      sub: 'google-tx-2',
      email: 'rollback@gmail.com',
      email_verified: true,
    });
    const res = await api().post('/api/auth/google').send({ credential: 'fake' });
    expect(res.status).toBe(500);
    expect(await User.countDocuments({ email: 'rollback@gmail.com' })).toBe(0);
  });
});
