/**
 * INTEGRATION tests for GET and PUT /api/users/profile (the logged-in user's own profile).
 *
 * Key promises: only `name` and `phone` can change (mass assignment is ignored), the phone
 * follows the Pakistani format, it can be cleared, and admins have a profile too.
 */
import { connectTestDB, clearTestDB, closeTestDB } from '../helpers/db.js';
import { api, loggedIn, bearer, createAdmin } from '../helpers/factories.js';
import { User } from '../../src/modules/models.js';

beforeAll(connectTestDB);
afterEach(clearTestDB);
afterAll(closeTestDB);

const getProfile = (auth) => api().get('/api/users/profile').set('Authorization', auth);
const putProfile = (auth, body) =>
  api().put('/api/users/profile').set('Authorization', auth).send(body);

describe('GET /api/users/profile', () => {
  it('returns my own profile without secrets', async () => {
    const { user, auth } = await loggedIn({ phone: '03001234567' });
    const res = await getProfile(auth);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Profile fetched');
    expect(res.body.data).toMatchObject({
      _id: String(user._id),
      email: user.email,
      phone: '03001234567',
      role: 'customer',
    });
    expect(res.body.data.password).toBeUndefined();
  });

  it('works for admins too (everyone has a profile)', async () => {
    const admin = await createAdmin();
    const res = await getProfile(bearer(admin));
    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe('admin');
  });

  it('returns 401 without a token', async () => {
    expect((await api().get('/api/users/profile')).status).toBe(401);
  });

  it('returns 401 with a forged token', async () => {
    expect((await getProfile('Bearer not.a.jwt')).status).toBe(401);
  });
});

describe('PUT /api/users/profile', () => {
  it('updates name and phone (trimmed) and saves them', async () => {
    const { user, auth } = await loggedIn();
    const res = await putProfile(auth, { name: '  Sara Ahmed  ', phone: ' 03211234567 ' });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Profile updated');
    expect(res.body.data).toMatchObject({ name: 'Sara Ahmed', phone: '03211234567' });

    const saved = await User.findById(user._id);
    expect(saved.name).toBe('Sara Ahmed');
    expect(saved.phone).toBe('03211234567');
  });

  it('is a PARTIAL update: fields that are not sent stay the same', async () => {
    const { user, auth } = await loggedIn({ name: 'Old Name', phone: '03001234567' });

    const onlyName = await putProfile(auth, { name: 'New Name' });
    expect(onlyName.body.data).toMatchObject({ name: 'New Name', phone: '03001234567' });

    const onlyPhone = await putProfile(auth, { phone: '03119876543' });
    expect(onlyPhone.body.data).toMatchObject({ name: 'New Name', phone: '03119876543' });

    const nothing = await putProfile(auth, {});
    expect(nothing.status).toBe(200);
    expect((await User.findById(user._id)).name).toBe('New Name');
  });

  it.each([[''], [null]])('removes the phone when it is sent as %p', async (empty) => {
    const { user, auth } = await loggedIn({ phone: '03001234567' });
    const res = await putProfile(auth, { phone: empty });

    expect(res.status).toBe(200);
    expect(res.body.data.phone).toBeUndefined();
    expect((await User.findById(user._id)).phone).toBeUndefined();
  });

  it('IGNORES fields the user may not change (mass assignment)', async () => {
    const { user, auth } = await loggedIn({ isEmailVerified: false });
    const res = await putProfile(auth, {
      name: 'Sneaky',
      role: 'admin',
      email: 'hacker@evil.com',
      isEmailVerified: true,
      isActive: false,
      tokenVersion: 99,
      password: 'newpass123',
    });

    expect(res.status).toBe(200);
    const saved = await User.findById(user._id).select('+password');
    expect(saved.name).toBe('Sneaky'); // the allowed field changed…
    expect(saved.role).toBe('customer'); // …everything else did not
    expect(saved.email).toBe(user.email);
    expect(saved.isEmailVerified).toBe(false);
    expect(saved.isActive).toBe(true);
    expect(saved.tokenVersion).toBe(0);
    expect(await saved.comparePassword('newpass123')).toBe(false);

    // The same token still works: nothing about the login changed
    expect((await getProfile(auth)).status).toBe(200);
  });

  it.each([
    ['name too short', { name: 'A' }, 'name'],
    ['name too long', { name: 'x'.repeat(51) }, 'name'],
    ['name not text', { name: 123 }, 'name'],
    ['phone wrong prefix', { phone: '04001234567' }, 'phone'],
    ['phone too short', { phone: '0300123' }, 'phone'],
    ['phone with letters', { phone: '0300abc4567' }, 'phone'],
    ['phone not text', { phone: 3001234567 }, 'phone'],
  ])('returns 400 for %s', async (_case, body, field) => {
    const { auth } = await loggedIn();
    const res = await putProfile(auth, body);
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Validation failed');
    expect(res.body.errors[0].field).toBe(field);
  });

  it('lets admins edit their own profile', async () => {
    const admin = await createAdmin();
    const res = await putProfile(bearer(admin), { name: 'Head Admin' });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Head Admin');
  });

  it('returns 401 without a token', async () => {
    const res = await api().put('/api/users/profile').send({ name: 'Nobody' });
    expect(res.status).toBe(401);
  });

  it('returns 401 for a token issued before a password change', async () => {
    const { user, auth } = await loggedIn();
    user.password = 'changed123'; // the pre-save hook bumps tokenVersion
    await user.save();
    expect((await putProfile(auth, { name: 'Too Late' })).status).toBe(401);
  });
});
