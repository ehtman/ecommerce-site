/**
 * src/db/schemas/image.schema.js – a reusable sub-schema for one stored image.
 *
 * WHAT: { url, publicId }. `url` is what the browser loads; `publicId` is the image's name
 *       inside Cloudinary, which we need later to DELETE the file when it is replaced.
 * WHY:  Categories (branch 03), products (04) and user avatars all store images the same way.
 *       Defining the shape once keeps the rules identical everywhere.
 * WHERE: Embedded in a parent schema, e.g. `image: { type: imageSchema }` in category.model.js.
 *
 * In this branch the admin sends an image that is ALREADY on Cloudinary. The upload
 * endpoint and deleting old files from Cloudinary arrive in branch 04 (products & uploads).
 */
import mongoose from 'mongoose';
import { REGEX } from '../../config/constants.js';

const imageSchema = new mongoose.Schema(
  {
    // Only https URLs on Cloudinary's CDN: nobody can make our shop load images from
    // a random (possibly malicious or very slow) website.
    url: {
      type: String,
      required: [true, 'Image URL is required'],
      trim: true,
      match: [REGEX.CLOUDINARY_URL, 'Image must be a Cloudinary URL'],
    },
    // e.g. "shopease/categories/abc123" – needed to delete the file from Cloudinary later
    publicId: {
      type: String,
      required: [true, 'Image publicId is required'],
      trim: true,
    },
  },
  // _id: true gives every image its own id, so a product with many images can delete ONE
  { _id: true },
);

export default imageSchema;
