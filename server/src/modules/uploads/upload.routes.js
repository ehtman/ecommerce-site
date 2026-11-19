/**
 * src/modules/uploads/upload.routes.js – the URL map of the uploads module.
 * Mounted in app.js under /api/uploads. ADMINS ONLY: customers never upload pictures here.
 *
 * Pipeline of the upload route, left to right:
 *   protect → authorize('admin') → validate(?folder) → multer (reads the file) → controller
 * The query is validated BEFORE multer on purpose: a bad request is refused before we spend
 * memory on reading up to 2 MB of file bytes.
 */
import { Router } from 'express';
import { protect, authorize } from '../../middleware/auth.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import upload from '../../middleware/upload.middleware.js';
import { ROLES } from '../../config/constants.js';
import * as c from './upload.controller.js';
import { uploadImageRules, deleteImageRules } from './upload.validation.js';

const router = Router();

// Every route below: logged in AND admin
router.use(protect, authorize(ROLES.ADMIN));

// upload.single('image') = "expect ONE file in the form field called image"
router.post('/image', validate(uploadImageRules), upload.single('image'), c.uploadImage);
router.delete('/image', validate(deleteImageRules), c.deleteUploadedImage);

export default router;
