/**
 * src/middleware/upload.middleware.js – reads ONE uploaded image from a multipart request.
 *
 * WHAT is a multipart request? JSON can only carry text. To send a FILE, a browser form (or
 * Postman's "form-data" tab) uses the content type `multipart/form-data`: the body is cut into
 * "parts", one per form field, and a part can hold raw file bytes. express.json() ignores such
 * bodies, so we need a parser for them: MULTER.
 * See docs/concepts/17-file-uploads-and-cdn.md.
 *
 * Our settings, and why:
 *  - memoryStorage: the file is kept in RAM (req.file.buffer) and streamed straight on to
 *    Cloudinary. Nothing is written to our disk (serverless hosts have no permanent disk).
 *  - limits: at most ONE file of at most LIMITS.MAX_IMAGE_BYTES (2 MB). A bigger file is cut
 *    off while it arrives, so nobody can fill our memory with a 2 GB "image".
 *  - fileFilter: only JPG, PNG and WEBP (by MIME type). Anything else → 400.
 *
 * Errors: our fileFilter throws an ApiError (400). Multer's own errors ("file too large",
 * "unexpected field") are MulterErrors, which error.middleware.js turns into 400 too.
 *
 * USED BY: modules/uploads/upload.routes.js → `upload.single('image')`.
 */
import multer from 'multer';
import ApiError from '../utils/ApiError.js';
import { LIMITS, IMAGE_MIME_TYPES } from '../config/constants.js';

const upload = multer({
  storage: multer.memoryStorage(), // keep the bytes in memory as a Buffer
  limits: {
    fileSize: LIMITS.MAX_IMAGE_BYTES, // bytes per file
    files: 1, // one file per request
    fields: 5, // a few small text fields at most (we do not need any)
  },
  // Runs once per file BEFORE its bytes are stored: cb(null, true) = accept, cb(err) = refuse
  fileFilter: (_req, file, cb) => {
    if (IMAGE_MIME_TYPES.includes(file.mimetype)) return cb(null, true);
    // The [{ field, message }] list makes this look like any other validation error
    const message = 'Only JPG, PNG and WEBP images are allowed';
    return cb(new ApiError(400, message, [{ field: file.fieldname, message }]));
  },
});

export default upload;
