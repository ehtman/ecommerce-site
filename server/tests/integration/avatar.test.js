/**
 * INTEGRATION tests for the user's avatar (new in branch 04).
 * Google sign-in copies the Google profile photo into `avatar.url` for NEW accounts.
 * Google is stubbed exactly like in google.test.js (no network).
 */
import { connectTestDB, clearTestDB, closeTestDB } from '../helpers/db.js';
import { api, createUser } from '../helpers/factories.js';
import { googleVerifier } from '../../src/modules/auth/google.verifier.js';
import { User } from '../../src/modules/models.js';

const realVerify = googleVerifier.verify;
const googleSays = (payload) => {
  googleVerifier.verify = async () => payload;
};
const payloadFor = (email, extra = {}) => ({
  sub: `google-${email}`,
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

describe('User avatar', () => {
  it('a new Google user gets the Google photo as avatar', async () => {
    const picture = 'https://lh3.googleusercontent.com/a/photo123';
    googleSays(payloadFor('pic@gmail.com', { picture }));
    const res = await login();
    expect(res.status).toBe(200);
    expect(res.body.data.user.avatar).toEqual({ url: picture });
    const saved = await User.findOne({ email: 'pic@gmail.com' });
    expect(saved.avatar.url).toBe(picture);
  });

  it('no Google photo → no avatar url', async () => {
    googleSays(payloadFor('nopic@gmail.com'));
    const res = await login();
    expect(res.status).toBe(200);
    expect(res.body.data.user.avatar?.url).toBeUndefined();
  });

  it('a normal user may have an avatar with a Cloudinary publicId', async () => {
    const user = await createUser({
      avatar: {
        url: 'https://res.cloudinary.com/demo/image/upload/a.jpg',
        publicId: 'shopease/avatars/a',
      },
    });
    expect(user.avatar.publicId).toBe('shopease/avatars/a');
  });
});
