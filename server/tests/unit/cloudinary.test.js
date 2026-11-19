/**
 * UNIT tests for src/config/cloudinary.js.
 *
 * Two levels of fakes, both offline:
 *  - the REAL cloudinaryClient methods are tested against a fake SDK (we replace the SDK's
 *    uploader functions), proving our Promise wrapper and arguments are right;
 *  - uploadBuffer/deleteImage are tested with a stubbed cloudinaryClient.
 */
import cloudinary, {
  cloudinaryClient,
  uploadBuffer,
  deleteImage,
  IMAGE_FOLDERS,
} from '../../src/config/cloudinary.js';
import env from '../../src/config/env.js';

const realClient = { ...cloudinaryClient };
const realUploader = { ...cloudinary.uploader };

afterEach(() => {
  Object.assign(cloudinaryClient, realClient);
  Object.assign(cloudinary.uploader, realUploader);
});

describe('cloudinaryClient (real methods, fake SDK)', () => {
  it('isConfigured() is false without the CLOUDINARY_* settings (as in tests)', () => {
    expect(env.CLOUDINARY_CLOUD_NAME).toBe('');
    expect(cloudinaryClient.isConfigured()).toBe(false);
  });

  it('upload() streams the buffer into the folder and resolves with the result', async () => {
    let options;
    let written;
    cloudinary.uploader.upload_stream = (opts, callback) => {
      options = opts;
      // A fake stream: end() receives the bytes and "Cloudinary" answers through the callback
      return {
        end(buffer) {
          written = buffer;
          callback(null, { secure_url: 'https://res.cloudinary.com/x.jpg', public_id: 'p' });
        },
      };
    };
    const result = await cloudinaryClient.upload(Buffer.from('abc'), 'shopease/products');
    expect(options).toEqual({ folder: 'shopease/products' });
    expect(written.toString()).toBe('abc');
    expect(result.public_id).toBe('p');
  });

  it('upload() rejects when the SDK reports an error', async () => {
    cloudinary.uploader.upload_stream = (_opts, callback) => ({
      end: () => callback(new Error('boom')),
    });
    await expect(cloudinaryClient.upload(Buffer.from('a'), 'f')).rejects.toThrow('boom');
  });

  it('destroy() calls the SDK with the publicId', async () => {
    const calls = [];
    cloudinary.uploader.destroy = async (id) => calls.push(id);
    await cloudinaryClient.destroy('shopease/products/a');
    expect(calls).toEqual(['shopease/products/a']);
  });
});

describe('uploadBuffer', () => {
  it('returns only { url, publicId }', async () => {
    cloudinaryClient.isConfigured = () => true;
    cloudinaryClient.upload = async (_buffer, folder) => ({
      secure_url: 'https://res.cloudinary.com/demo/a.jpg',
      public_id: `${folder}/a`,
      bytes: 123, // extra Cloudinary fields are dropped
    });
    await expect(uploadBuffer(Buffer.from('x'))).resolves.toEqual({
      url: 'https://res.cloudinary.com/demo/a.jpg',
      publicId: `${IMAGE_FOLDERS.products}/a`,
    });
  });
});

describe('deleteImage', () => {
  beforeEach(() => {
    cloudinaryClient.isConfigured = () => true;
  });

  it.each([undefined, '', 'other-account/photo'])(
    'skips a missing or foreign publicId %p',
    async (publicId) => {
      let called = false;
      cloudinaryClient.destroy = async () => {
        called = true;
      };
      await expect(deleteImage(publicId)).resolves.toBe(false);
      expect(called).toBe(false);
    },
  );

  it('logs (outside tests) and swallows a Cloudinary failure', async () => {
    cloudinaryClient.destroy = async () => {
      throw new Error('offline');
    };
    // Replace console.error by a recorder for this one test
    const realError = console.error;
    const logged = [];
    console.error = (...args) => logged.push(args);
    env.isTest = false; // pretend to be in development for this one call
    try {
      await expect(deleteImage('shopease/products/a')).resolves.toBe(false);
      expect(logged).toEqual([['Cloudinary delete failed:', 'offline']]);
    } finally {
      env.isTest = true;
      console.error = realError;
    }
  });
});
