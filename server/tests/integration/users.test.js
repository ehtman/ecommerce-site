/**
 * INTEGRATION tests for PUT /api/users/password (change password while logged in).
 */
import { connectTestDB, clearTestDB, closeTestDB } from '../helpers/db.js';
import { api, loggedIn, PASSWORD } from '../helpers/factories.js';
import { outbox } from '../../src/emails/sendEmail.js';
import { User } from '../../src/modules/models.js';

beforeAll(connectTestDB);
afterEach(clearTestDB);
afterAll(closeTestDB);

const change = (auth, body) =>
  api().put('/api/users/password').set('Authorization', auth).send(body);

describe('PUT /api/users/password', () => {
  it('changes the password, emails a notice and returns a NEW working token', async () => {
    const { user, auth } = await loggedIn();
    const res = await change(auth, { currentPassword: PASSWORD, newPassword: 'newpass123' });

    expect(res.status).toBe(200);
    expect(outbox.at(-1)).toMatchObject({ to: user.email });

    // The fresh token works…
    const fresh = `Bearer ${res.body.data.token}`;
    expect((await api().get('/api/auth/me').set('Authorization', fresh)).status).toBe(200);
    // …and the new password logs in
    const login = await api()
      .post('/api/auth/login')
      .send({ email: user.email, password: 'newpass123' });
    expect(login.status).toBe(200);
  });

  it('invalidates the OLD token (other devices are logged out)', async () => {
    const { user, auth } = await loggedIn();
    await change(auth, { currentPassword: PASSWORD, newPassword: 'newpass123' });
    expect((await api().get('/api/auth/me').set('Authorization', auth)).status).toBe(401);

    // How: the password change bumped tokenVersion 0 → 1 and recorded the time
    const saved = await User.findById(user._id);
    expect(saved.tokenVersion).toBe(1);
    expect(saved.passwordChangedAt).toBeInstanceOf(Date);
  });

  it('does NOT bump tokenVersion when other fields change', async () => {
    const { user } = await loggedIn();
    user.name = 'Renamed';
    await user.save();
    expect((await User.findById(user._id)).tokenVersion).toBe(0);
  });

  it('returns 401 when the current password is wrong', async () => {
    const { auth } = await loggedIn();
    const res = await change(auth, { currentPassword: 'wrong123', newPassword: 'newpass123' });
    expect(res.status).toBe(401);
    expect(res.body.errors[0].field).toBe('currentPassword');
  });

  it('returns 400 when the new password equals the current one', async () => {
    const { auth } = await loggedIn();
    const res = await change(auth, { currentPassword: PASSWORD, newPassword: PASSWORD });
    expect(res.status).toBe(400);
  });

  it('returns 400 for a weak new password', async () => {
    const { auth } = await loggedIn();
    const res = await change(auth, { currentPassword: PASSWORD, newPassword: 'weak' });
    expect(res.status).toBe(400);
    expect(res.body.errors[0].field).toBe('newPassword');
  });

  it('returns 400 for Google accounts without a password', async () => {
    const { auth } = await loggedIn({ authProvider: 'google', password: undefined });
    const res = await change(auth, { currentPassword: 'anything1', newPassword: 'newpass123' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Google accounts/);
  });

  it('requires a token', async () => {
    const res = await api().put('/api/users/password').send({});
    expect(res.status).toBe(401);
  });
});
