/**
 * INTEGRATION tests for /api/addresses (a customer's saved delivery addresses).
 *
 * Key promises:
 *  - customers only (401 without a token, 403 for admins)
 *  - OWNERSHIP: another customer's address is invisible → 404, never 200 or 403 (no IDOR)
 *  - at most 5 addresses
 *  - "exactly one default" whenever the customer has at least one address
 *  - the owner always comes from the token (mass assignment of `user` is ignored)
 */
import mongoose from 'mongoose';
import { connectTestDB, clearTestDB, closeTestDB } from '../helpers/db.js';
import {
  api,
  loggedIn,
  bearer,
  createAdmin,
  createAddress,
  validAddress,
} from '../helpers/factories.js';
import { Address } from '../../src/modules/models.js';

beforeAll(connectTestDB);
afterEach(clearTestDB);
afterAll(closeTestDB);

// Short request helpers: each test reads like a sentence
const list = (auth) => api().get('/api/addresses').set('Authorization', auth);
const create = (auth, body = validAddress()) =>
  api().post('/api/addresses').set('Authorization', auth).send(body);
const update = (auth, id, body = validAddress()) =>
  api().put(`/api/addresses/${id}`).set('Authorization', auth).send(body);
const remove = (auth, id) => api().delete(`/api/addresses/${id}`).set('Authorization', auth);
const makeDefault = (auth, id) =>
  api().patch(`/api/addresses/${id}/default`).set('Authorization', auth);

// How many default addresses does this user have in the DATABASE? (must be 0 or 1)
const defaultsOf = (user) => Address.countDocuments({ user: user._id, isDefault: true });
// A valid id that belongs to no document
const missingId = () => new mongoose.Types.ObjectId().toString();

describe('Access control (all /api/addresses routes)', () => {
  const routes = [
    ['GET', (r) => r.get('/api/addresses')],
    ['POST', (r) => r.post('/api/addresses').send(validAddress())],
    ['PUT', (r) => r.put(`/api/addresses/${missingId()}`).send(validAddress())],
    ['DELETE', (r) => r.delete(`/api/addresses/${missingId()}`)],
    ['PATCH default', (r) => r.patch(`/api/addresses/${missingId()}/default`)],
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

  it('returns 403 for a disabled customer', async () => {
    const { auth } = await loggedIn({ isActive: false });
    expect((await list(auth)).status).toBe(403);
  });
});

describe('GET /api/addresses', () => {
  it('returns an empty list for a new customer', async () => {
    const { auth } = await loggedIn();
    const res = await list(auth);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, message: 'Addresses fetched', data: [] });
  });

  it('lists ONLY my addresses: the default first, then newest first', async () => {
    const { user, auth } = await loggedIn();
    const other = await loggedIn();
    const first = await createAddress(user, { city: 'First', isDefault: true });
    const second = await createAddress(user, { city: 'Second' });
    const third = await createAddress(user, { city: 'Third' });
    await createAddress(other.user, { city: 'Not mine', isDefault: true });

    const res = await list(auth);
    expect(res.status).toBe(200);
    expect(res.body.data.map((a) => a._id)).toEqual([
      String(first._id), // the default
      String(third._id), // then the newest…
      String(second._id),
    ]);
    expect(res.body.data.every((a) => a.user === String(user._id))).toBe(true);
    expect(res.body.data[0].__v).toBeUndefined(); // toJSON plugin cleans the output
  });
});

describe('POST /api/addresses', () => {
  it('creates my first address and makes it the default automatically', async () => {
    const { user, auth } = await loggedIn();
    const res = await create(auth, validAddress({ addressLine2: 'Near the park' }));

    expect(res.status).toBe(201);
    expect(res.body.message).toBe('Address added');
    expect(res.body.data).toMatchObject({
      ...validAddress({ addressLine2: 'Near the park' }),
      user: String(user._id),
      country: 'Pakistan',
      isDefault: true,
    });
  });

  it('does NOT make later addresses default unless asked', async () => {
    const { user, auth } = await loggedIn();
    await create(auth);
    const res = await create(auth, validAddress({ city: 'Karachi', province: 'Sindh' }));

    expect(res.status).toBe(201);
    expect(res.body.data.isDefault).toBe(false);
    expect(await defaultsOf(user)).toBe(1);
  });

  it('isDefault: true moves the default to the new address (still exactly one)', async () => {
    const { user, auth } = await loggedIn();
    const first = await create(auth);
    const res = await create(auth, validAddress({ city: 'Islamabad', isDefault: true }));

    expect(res.body.data.isDefault).toBe(true);
    expect((await Address.findById(first.body.data._id)).isDefault).toBe(false);
    expect(await defaultsOf(user)).toBe(1);
  });

  it('the first address is the default even if isDefault: false is sent', async () => {
    const { auth } = await loggedIn();
    const res = await create(auth, validAddress({ isDefault: false }));
    expect(res.body.data.isDefault).toBe(true);
  });

  it('defaults the label to "Home" and trims text', async () => {
    const { auth } = await loggedIn();
    const body = validAddress({ fullName: '  Sara  ', city: ' Multan ' });
    delete body.label;
    const res = await create(auth, body);
    expect(res.body.data).toMatchObject({ label: 'Home', fullName: 'Sara', city: 'Multan' });
  });

  it('allows at most 5 addresses: the 6th returns 400', async () => {
    const { user, auth } = await loggedIn();
    for (let i = 0; i < 5; i += 1) {
      // One after another (not in parallel), so "the first one is the default" holds
      expect((await create(auth, validAddress({ city: `City ${i}` }))).status).toBe(201);
    }
    const res = await create(auth);
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('You can save at most 5 addresses');
    expect(await Address.countDocuments({ user: user._id })).toBe(5);
  });

  it("the limit is per customer: other customers' addresses don't count", async () => {
    const other = await loggedIn();
    for (let i = 0; i < 5; i += 1) {
      await createAddress(other.user, { isDefault: i === 0 });
    }
    const { auth } = await loggedIn();
    expect((await create(auth)).status).toBe(201);
  });

  it('IGNORES user, country and _id in the body (mass assignment)', async () => {
    const { user, auth } = await loggedIn();
    const victim = await loggedIn();
    const res = await create(auth, {
      ...validAddress(),
      user: String(victim.user._id), // try to create it in someone else's account
      country: 'India',
      _id: missingId(),
    });

    expect(res.status).toBe(201);
    expect(res.body.data.user).toBe(String(user._id));
    expect(res.body.data.country).toBe('Pakistan');
    expect(await Address.countDocuments({ user: victim.user._id })).toBe(0);
  });

  it.each([
    ['missing fullName', { fullName: undefined }, 'fullName'],
    ['short fullName', { fullName: 'A' }, 'fullName'],
    ['missing phone', { phone: undefined }, 'phone'],
    ['bad phone', { phone: '12345' }, 'phone'],
    ['short addressLine1', { addressLine1: 'abc' }, 'addressLine1'],
    ['long addressLine2', { addressLine2: 'x'.repeat(121) }, 'addressLine2'],
    ['missing city', { city: undefined }, 'city'],
    ['unknown province', { province: 'Texas' }, 'province'],
    ['4-digit postal code', { postalCode: '5400' }, 'postalCode'],
    ['letters in postal code', { postalCode: '54A00' }, 'postalCode'],
    ['unknown label', { label: 'Holiday home' }, 'label'],
    ['non-boolean isDefault', { isDefault: 'yes' }, 'isDefault'],
  ])('returns 400 for %s', async (_case, change, field) => {
    const { auth } = await loggedIn();
    const res = await create(auth, validAddress(change));
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Validation failed');
    expect(res.body.errors.map((e) => e.field)).toContain(field);
  });

  it('accepts every province and label from the constants', async () => {
    const { auth } = await loggedIn();
    const res = await create(auth, validAddress({ province: 'AJK', label: 'Other' }));
    expect(res.status).toBe(201);
  });
});

describe('PUT /api/addresses/:id', () => {
  it('replaces the fields of my address', async () => {
    const { user, auth } = await loggedIn();
    const address = await createAddress(user, { isDefault: true });
    const body = validAddress({ label: 'Work', city: 'Karachi', province: 'Sindh' });

    const res = await update(auth, address._id, body);
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Address updated');
    expect(res.body.data).toMatchObject({ label: 'Work', city: 'Karachi', province: 'Sindh' });
    expect((await Address.findById(address._id)).city).toBe('Karachi');
  });

  it('isDefault: true makes it the default and un-defaults the old one', async () => {
    const { user, auth } = await loggedIn();
    const oldDefault = await createAddress(user, { isDefault: true });
    const other = await createAddress(user);

    const res = await update(auth, other._id, validAddress({ isDefault: true }));
    expect(res.body.data.isDefault).toBe(true);
    expect((await Address.findById(oldDefault._id)).isDefault).toBe(false);
    expect(await defaultsOf(user)).toBe(1);
  });

  it('isDefault: false on the default address is ignored (never zero defaults)', async () => {
    const { user, auth } = await loggedIn();
    const address = await createAddress(user, { isDefault: true });
    const res = await update(auth, address._id, validAddress({ isDefault: false }));
    expect(res.status).toBe(200);
    expect(res.body.data.isDefault).toBe(true);
    expect(await defaultsOf(user)).toBe(1);
  });

  it("returns 404 for ANOTHER customer's address and leaves it untouched (no IDOR)", async () => {
    const owner = await loggedIn();
    const address = await createAddress(owner.user, { isDefault: true, city: 'Lahore' });
    const attacker = await loggedIn();

    const res = await update(attacker.auth, address._id, validAddress({ city: 'Hacked' }));
    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Address not found');
    expect((await Address.findById(address._id)).city).toBe('Lahore');
  });

  it('cannot move my address into another account by sending `user`', async () => {
    const { user, auth } = await loggedIn();
    const victim = await loggedIn();
    const address = await createAddress(user, { isDefault: true });

    await update(auth, address._id, { ...validAddress(), user: String(victim.user._id) });
    expect(String((await Address.findById(address._id)).user)).toBe(String(user._id));
  });

  it('returns 404 for an id that does not exist', async () => {
    const { auth } = await loggedIn();
    expect((await update(auth, missingId())).status).toBe(404);
  });

  it('returns 400 "Invalid id" for a malformed id (before touching the database)', async () => {
    const { auth } = await loggedIn();
    const res = await update(auth, 'not-an-id');
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ message: 'Invalid id', errors: [{ field: 'id' }] });
  });

  it('returns 400 for invalid fields', async () => {
    const { user, auth } = await loggedIn();
    const address = await createAddress(user, { isDefault: true });
    const res = await update(auth, address._id, validAddress({ postalCode: '1' }));
    expect(res.status).toBe(400);
    expect(res.body.errors[0].field).toBe('postalCode');
  });
});

describe('DELETE /api/addresses/:id', () => {
  it('deletes my (non-default) address and keeps the default', async () => {
    const { user, auth } = await loggedIn();
    const def = await createAddress(user, { isDefault: true });
    const other = await createAddress(user);

    const res = await remove(auth, other._id);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ message: 'Address deleted', data: null });
    expect(await Address.findById(other._id)).toBeNull();
    expect((await Address.findById(def._id)).isDefault).toBe(true);
  });

  it('deleting the default makes the NEWEST remaining address the default', async () => {
    const { user, auth } = await loggedIn();
    const def = await createAddress(user, { isDefault: true });
    const older = await createAddress(user, { city: 'Older' });
    const newest = await createAddress(user, { city: 'Newest' });

    await remove(auth, def._id);
    expect((await Address.findById(newest._id)).isDefault).toBe(true);
    expect((await Address.findById(older._id)).isDefault).toBe(false);
    expect(await defaultsOf(user)).toBe(1);
  });

  it('deleting my last address leaves zero addresses (and no default)', async () => {
    const { user, auth } = await loggedIn();
    const only = await createAddress(user, { isDefault: true });
    expect((await remove(auth, only._id)).status).toBe(200);
    expect(await Address.countDocuments({ user: user._id })).toBe(0);
  });

  it("returns 404 for ANOTHER customer's address and does not delete it (no IDOR)", async () => {
    const owner = await loggedIn();
    const address = await createAddress(owner.user, { isDefault: true });
    const attacker = await loggedIn();

    expect((await remove(attacker.auth, address._id)).status).toBe(404);
    expect(await Address.findById(address._id)).not.toBeNull();
  });

  it('returns 404 the second time (already deleted)', async () => {
    const { user, auth } = await loggedIn();
    const address = await createAddress(user, { isDefault: true });
    await remove(auth, address._id);
    expect((await remove(auth, address._id)).status).toBe(404);
  });

  it('returns 400 for a malformed id', async () => {
    const { auth } = await loggedIn();
    expect((await remove(auth, '123')).status).toBe(400);
  });
});

describe('PATCH /api/addresses/:id/default', () => {
  it('makes the address the default and returns the updated list (default first)', async () => {
    const { user, auth } = await loggedIn();
    const oldDefault = await createAddress(user, { isDefault: true });
    const target = await createAddress(user, { city: 'Peshawar', province: 'KPK' });

    const res = await makeDefault(auth, target._id);
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Default address updated');
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0]).toMatchObject({ _id: String(target._id), isDefault: true });
    expect(res.body.data[1]).toMatchObject({ _id: String(oldDefault._id), isDefault: false });
    expect(await defaultsOf(user)).toBe(1);
  });

  it('is idempotent: making the default the default again changes nothing', async () => {
    const { user, auth } = await loggedIn();
    const def = await createAddress(user, { isDefault: true });
    const res = await makeDefault(auth, def._id);
    expect(res.status).toBe(200);
    expect(await defaultsOf(user)).toBe(1);
  });

  it("returns 404 for ANOTHER customer's address and keeps BOTH defaults intact", async () => {
    const owner = await loggedIn();
    const victimAddress = await createAddress(owner.user, { isDefault: true });
    const attacker = await loggedIn();
    const attackerDefault = await createAddress(attacker.user, { isDefault: true });

    const res = await makeDefault(attacker.auth, victimAddress._id);
    expect(res.status).toBe(404);
    // The transaction rolled back the "unset my old default" step:
    expect((await Address.findById(attackerDefault._id)).isDefault).toBe(true);
    expect((await Address.findById(victimAddress._id)).isDefault).toBe(true);
  });

  it('returns 404 for a missing id and 400 for a malformed one', async () => {
    const { auth } = await loggedIn();
    expect((await makeDefault(auth, missingId())).status).toBe(404);
    expect((await makeDefault(auth, 'abc')).status).toBe(400);
  });
});

describe('Database safety net', () => {
  it('the unique partial index refuses a second default for the same user', async () => {
    const { user } = await loggedIn();
    await createAddress(user, { isDefault: true });
    await expect(createAddress(user, { isDefault: true })).rejects.toMatchObject({
      code: 11000, // MongoDB's "duplicate key" error
    });
  });

  it('…but allows any number of non-default addresses, and defaults for other users', async () => {
    const a = await loggedIn();
    const b = await loggedIn();
    await createAddress(a.user, { isDefault: true });
    await createAddress(a.user);
    await createAddress(a.user);
    await expect(createAddress(b.user, { isDefault: true })).resolves.toBeDefined();
  });
});
