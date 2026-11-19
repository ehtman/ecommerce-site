/**
 * INTEGRATION tests for /api/uploads (admin image uploads).
 *
 * Cloudinary is NEVER called. Like google.test.js stubs googleVerifier, we replace the methods
 * of `cloudinaryClient` (src/config/cloudinary.js) with fakes. The fakes also RECORD what they
 * were given, so tests can check which folder and which bytes would have been uploaded.
 */
import { connectTestDB, clearTestDB, closeTestDB } from '../helpers/db.js';
import { api, loggedIn, createAdmin, bearer } from '../helpers/factories.js';
import { cloudinaryClient } from '../../src/config/cloudinary.js';
import { LIMITS } from '../../src/config/constants.js';

// Keep the real methods so every test can start from them again
const real = { ...cloudinaryClient };
let uploads; // what the fake "Cloudinary" received
let destroyed;

// Turn the fake Cloudinary on: configured, uploads succeed, deletes succeed
function fakeCloudinary() {
  uploads = [];
  destroyed = [];
  cloudinaryClient.isConfigured = () => true;
  cloudinaryClient.upload = async (buffer, folder) => {
    uploads.push({ buffer, folder });
    return {
      secure_url: `https://res.cloudinary.com/demo/image/upload/${folder}/fake${uploads.length}.jpg`,
      public_id: `${folder}/fake${uploads.length}`,
    };
  };
  cloudinaryClient.destroy = async (publicId) => {
    destroyed.push(publicId);
    return { result: 'ok' };
  };
}

// A tiny "image": the bytes do not matter, multer only checks the declared type and size
const PNG = Buffer.from('89504e470d0a1a0a', 'hex');

let adminAuth;
let customerAuth;

beforeAll(connectTestDB);
beforeEach(async () => {
  fakeCloudinary();
  adminAuth = bearer(await createAdmin());
  ({ auth: customerAuth } = await loggedIn());
});
afterEach(async () => {
  Object.assign(cloudinaryClient, real); // put the real methods back
  await clearTestDB();
});
afterAll(closeTestDB);

const send = (auth, query = '') =>
  api().post(`/api/uploads/image${query}`).set('Authorization', auth);

describe('POST /api/uploads/image', () => {
  it('uploads a PNG to the products folder by default → 201 { url, publicId }', async () => {
    const res = await send(adminAuth).attach('image', PNG, {
      filename: 'shirt.png',
      contentType: 'image/png',
    });
    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({
      url: 'https://res.cloudinary.com/demo/image/upload/shopease/products/fake1.jpg',
      publicId: 'shopease/products/fake1',
    });
    // The exact bytes were passed on to Cloudinary, into the products folder
    expect(uploads).toHaveLength(1);
    expect(uploads[0].folder).toBe('shopease/products');
    expect(uploads[0].buffer.equals(PNG)).toBe(true);
  });

  it.each(['image/jpeg', 'image/webp'])('accepts %s', async (contentType) => {
    const res = await send(adminAuth).attach('image', PNG, { filename: 'a.img', contentType });
    expect(res.status).toBe(201);
  });

  it('uses the categories folder when asked', async () => {
    const res = await send(adminAuth, '?folder=categories').attach('image', PNG, {
      filename: 'c.png',
      contentType: 'image/png',
    });
    expect(res.status).toBe(201);
    expect(uploads[0].folder).toBe('shopease/categories');
  });

  it('400 for an unknown folder (checked before the file is read)', async () => {
    const res = await send(adminAuth, '?folder=../secrets').attach('image', PNG, {
      filename: 'c.png',
      contentType: 'image/png',
    });
    expect(res.status).toBe(400);
    expect(res.body.errors[0].field).toBe('folder');
    expect(uploads).toHaveLength(0);
  });

  it('400 when no file is sent', async () => {
    const res = await send(adminAuth).field('note', 'no file here');
    expect(res.status).toBe(400);
    expect(res.body.errors[0].field).toBe('image');
  });

  it('400 for a file type that is not an image (e.g. a PDF or an SVG)', async () => {
    for (const [filename, contentType] of [
      ['doc.pdf', 'application/pdf'],
      ['logo.svg', 'image/svg+xml'],
      ['anim.gif', 'image/gif'],
    ]) {
      const res = await send(adminAuth).attach('image', PNG, { filename, contentType });
      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Only JPG, PNG and WEBP images are allowed');
    }
    expect(uploads).toHaveLength(0);
  });

  it('400 for a file larger than 2 MB', async () => {
    const big = Buffer.alloc(LIMITS.MAX_IMAGE_BYTES + 1);
    const res = await send(adminAuth).attach('image', big, {
      filename: 'big.jpg',
      contentType: 'image/jpeg',
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Each image must be 2 MB or less');
    expect(uploads).toHaveLength(0);
  });

  it('accepts a file of exactly 2 MB', async () => {
    const res = await send(adminAuth).attach('image', Buffer.alloc(LIMITS.MAX_IMAGE_BYTES), {
      filename: 'max.jpg',
      contentType: 'image/jpeg',
    });
    expect(res.status).toBe(201);
  });

  it('400 when the file is sent under another field name', async () => {
    const res = await send(adminAuth).attach('photo', PNG, {
      filename: 'a.png',
      contentType: 'image/png',
    });
    expect(res.status).toBe(400);
    expect(res.body.errors[0].field).toBe('photo');
  });

  it('400 when two files are sent', async () => {
    const res = await send(adminAuth)
      .attach('image', PNG, { filename: 'a.png', contentType: 'image/png' })
      .attach('image', PNG, { filename: 'b.png', contentType: 'image/png' });
    expect(res.status).toBe(400);
  });

  it('500 with a clear message when Cloudinary is not configured', async () => {
    cloudinaryClient.isConfigured = () => false;
    const res = await send(adminAuth).attach('image', PNG, {
      filename: 'a.png',
      contentType: 'image/png',
    });
    expect(res.status).toBe(500);
    expect(res.body.message).toMatch(/Cloudinary is not configured/);
  });

  it('502 when Cloudinary fails (its error text is not leaked)', async () => {
    cloudinaryClient.upload = async () => {
      throw new Error('api_secret mismatch for account 123');
    };
    const res = await send(adminAuth).attach('image', PNG, {
      filename: 'a.png',
      contentType: 'image/png',
    });
    expect(res.status).toBe(502);
    expect(res.body.message).toBe('Image upload failed');
  });

  it('401 without a token', async () => {
    const res = await api()
      .post('/api/uploads/image')
      .attach('image', PNG, { filename: 'a.png', contentType: 'image/png' });
    expect(res.status).toBe(401);
  });

  it('403 for a customer', async () => {
    const res = await send(customerAuth).attach('image', PNG, {
      filename: 'a.png',
      contentType: 'image/png',
    });
    expect(res.status).toBe(403);
    expect(uploads).toHaveLength(0);
  });
});

describe('DELETE /api/uploads/image', () => {
  const remove = (auth, body) =>
    api().delete('/api/uploads/image').set('Authorization', auth).send(body);

  it('deletes one of our images from Cloudinary', async () => {
    const res = await remove(adminAuth, { publicId: 'shopease/products/abc123' });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ deleted: true });
    expect(destroyed).toEqual(['shopease/products/abc123']);
  });

  it('answers 200 { deleted: false } when Cloudinary is not configured', async () => {
    cloudinaryClient.isConfigured = () => false;
    const res = await remove(adminAuth, { publicId: 'shopease/products/abc123' });
    expect(res.status).toBe(200);
    expect(res.body.data.deleted).toBe(false);
    expect(destroyed).toEqual([]);
  });

  it('answers 200 { deleted: false } when Cloudinary fails (never crashes)', async () => {
    cloudinaryClient.destroy = async () => {
      throw new Error('network down');
    };
    const res = await remove(adminAuth, { publicId: 'shopease/products/abc123' });
    expect(res.status).toBe(200);
    expect(res.body.data.deleted).toBe(false);
  });

  it.each([{}, { publicId: '' }, { publicId: 'someone-else/photo' }, { publicId: 42 }])(
    '400 for an invalid publicId %p',
    async (body) => {
      const res = await remove(adminAuth, body);
      expect(res.status).toBe(400);
      expect(res.body.errors[0].field).toBe('publicId');
      expect(destroyed).toEqual([]);
    },
  );

  it('401 without a token', async () => {
    const res = await api().delete('/api/uploads/image').send({ publicId: 'shopease/products/x' });
    expect(res.status).toBe(401);
  });

  it('403 for a customer', async () => {
    const res = await remove(customerAuth, { publicId: 'shopease/products/x' });
    expect(res.status).toBe(403);
    expect(destroyed).toEqual([]);
  });
});
