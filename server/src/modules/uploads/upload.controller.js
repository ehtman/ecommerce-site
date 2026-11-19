/**
 * src/modules/uploads/upload.controller.js – HTTP layer for /api/uploads.
 *
 * Layers: routes → CONTROLLER → config/cloudinary.js. Uploading is a thin "pass the file on"
 * job with no database work, so there is no separate service file: the Cloudinary helpers in
 * config/cloudinary.js play the service role.
 *
 * The two-step image flow (why uploads are separate from products):
 *   1. the admin picks a picture → POST /api/uploads/image (multipart) → { url, publicId }
 *   2. the admin saves the form  → POST /api/products (JSON) with images: [{ url, publicId }]
 * So the product routes stay pure JSON, and one picture can be uploaded before the product
 * even exists.
 */
import asyncHandler from '../../utils/asyncHandler.js';
import ApiError from '../../utils/ApiError.js';
import { sendSuccess } from '../../utils/ApiResponse.js';
import { uploadBuffer, deleteImage, IMAGE_FOLDERS } from '../../config/cloudinary.js';

// POST /api/uploads/image?folder=products → 201 { url, publicId }
export const uploadImage = asyncHandler(async (req, res) => {
  // multer puts the file on req.file. No file = the form field "image" was missing.
  if (!req.file) {
    const message = 'Please choose an image (form field "image")';
    throw new ApiError(400, message, [{ field: 'image', message }]);
  }
  // The folder was validated already; no folder → products
  const folder = IMAGE_FOLDERS[req.query.folder] || IMAGE_FOLDERS.products;
  const image = await uploadBuffer(req.file.buffer, folder);
  sendSuccess(res, 201, 'Image uploaded', image);
});

// DELETE /api/uploads/image { publicId } → used when the admin removes a freshly uploaded
// picture BEFORE saving the form (otherwise it would stay on Cloudinary forever, unused).
export const deleteUploadedImage = asyncHandler(async (req, res) => {
  const deleted = await deleteImage(req.body.publicId);
  // `deleted` is false when Cloudinary is not configured (nothing to delete) or failed
  sendSuccess(res, 200, 'Image deleted', { deleted });
});
