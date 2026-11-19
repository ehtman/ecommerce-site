/**
 * src/modules/uploads/upload.validation.js – input rules for the upload routes.
 *
 * The FILE itself is checked by multer (middleware/upload.middleware.js: type and size).
 * This file checks the small text inputs that come with it.
 * Run by middleware/validate.middleware.js (see upload.routes.js).
 */
import { body, query } from 'express-validator';
import { IMAGE_FOLDERS } from '../../config/cloudinary.js';

// POST /api/uploads/image?folder=products|categories
export const uploadImageRules = [
  query('folder')
    .optional() // no folder → products (the most common case)
    .isIn(Object.keys(IMAGE_FOLDERS))
    .withMessage(`Folder must be one of: ${Object.keys(IMAGE_FOLDERS).join(', ')}`),
];

// DELETE /api/uploads/image  { "publicId": "shopease/products/abc123" }
export const deleteImageRules = [
  body('publicId')
    .isString()
    .withMessage('publicId is required')
    .bail()
    .trim()
    // Only OUR files (every folder we upload into starts with "shopease/"). This stops an
    // admin token from being used to delete other files on the same Cloudinary account.
    .matches(/^shopease\/[\w/-]{1,200}$/)
    .withMessage('publicId must be one of our images (shopease/…)'),
];
