/**
 * src/config/cloudinary.js – our ONLY connection to Cloudinary, the image-hosting service.
 *
 * WHAT is Cloudinary? A company that stores images for us and serves them from a CDN
 * ("Content Delivery Network": copies of each file on servers all over the world, so a
 * shopper in Karachi downloads the picture from a nearby server, fast). Our database only
 * keeps the image's `url` (what the browser loads) and `publicId` (its name inside
 * Cloudinary, needed to delete it). See docs/concepts/17-file-uploads-and-cdn.md.
 *
 * WHY NOT SAVE IMAGES ON OUR OWN SERVER? Serverless hosts (Vercel) have no permanent disk,
 * images are big (they would slow our API down), and a CDN can resize/compress them for us.
 *
 * WHY THE `cloudinaryClient` OBJECT? Like auth/google.verifier.js, it is a boundary to an
 * EXTERNAL service. Every call to Cloudinary goes through this one small object, so tests can
 * replace its methods with fakes ("stubs") and run offline, fast and for free.
 *
 * USED BY: modules/uploads (upload/delete a file), modules/products (delete the files of
 *          removed images), and categories (delete a replaced category image).
 */
import { v2 as cloudinary } from 'cloudinary'; // the official Cloudinary SDK (version 2 API)
import env from './env.js';
import ApiError from '../utils/ApiError.js';

// Every file we upload goes into a folder that starts with "shopease/". That prefix also
// protects deleteImage(): we never delete a file that is not ours.
export const IMAGE_FOLDERS = Object.freeze({
  products: 'shopease/products',
  categories: 'shopease/categories',
});
const OUR_PREFIX = 'shopease/';

// Give the SDK our account details once, at start-up. Empty values are fine here: the SDK only
// complains when it is actually used, and we check isConfigured() before every use.
cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
  secure: true, // always build https:// URLs
});

/** The thin wrapper around the SDK. Tests stub these three methods. */
export const cloudinaryClient = {
  /** true only when all three CLOUDINARY_* settings are present. */
  isConfigured() {
    return Boolean(
      env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET,
    );
  },

  /**
   * Sends a file that is in memory (a Buffer) to Cloudinary and resolves with Cloudinary's
   * answer ({ secure_url, public_id, … }). The SDK's "upload_stream" uses a callback, so we
   * wrap it in a Promise to be able to `await` it.
   */
  upload(buffer, folder) {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream({ folder }, (error, result) =>
        error ? reject(error) : resolve(result),
      );
      stream.end(buffer); // write the whole buffer into the stream and close it
    });
  },

  /** Deletes one file by its publicId. */
  destroy(publicId) {
    return cloudinary.uploader.destroy(publicId);
  },
};

/**
 * Uploads an image buffer (from multer) and returns ONLY what we store: { url, publicId }.
 * Throws 500 when Cloudinary is not configured, 502 ("bad gateway": the service behind us
 * failed) when Cloudinary refuses or cannot be reached.
 */
export async function uploadBuffer(buffer, folder = IMAGE_FOLDERS.products) {
  if (!cloudinaryClient.isConfigured()) {
    throw new ApiError(
      500,
      'Cloudinary is not configured. Add the CLOUDINARY_* keys to server/.env',
    );
  }
  let result;
  try {
    result = await cloudinaryClient.upload(buffer, folder);
  } catch {
    // Cloudinary's own error text may contain account details, so we send a generic message
    throw new ApiError(502, 'Image upload failed');
  }
  // secure_url = the https CDN address; public_id = e.g. "shopease/products/abc123"
  return { url: result.secure_url, publicId: result.public_id };
}

/**
 * Deletes an image from Cloudinary. NEVER throws: a picture left behind on Cloudinary is a
 * small cost, but failing the admin's request (the product was already saved!) would be worse.
 * Returns true if Cloudinary was asked to delete it, false if it was skipped or failed.
 */
export async function deleteImage(publicId) {
  // Skip when uploads are off, when there is no id, or when the file is not one of OURS
  if (!cloudinaryClient.isConfigured() || !publicId || !publicId.startsWith(OUR_PREFIX)) {
    return false;
  }
  try {
    await cloudinaryClient.destroy(publicId);
    return true;
  } catch (err) {
    // Log it for developers (quiet in tests) and carry on
    if (!env.isTest) console.error('Cloudinary delete failed:', err.message);
    return false;
  }
}

export default cloudinary;
