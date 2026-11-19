/**
 * src/middleware/error.middleware.js – the ONLY place that sends error responses.
 *
 * Express recognises an error handler by its FOUR parameters (err, req, res, next).
 * Every `throw` in a controller/service (through asyncHandler) and every `next(err)`
 * ends up here. We turn many kinds of errors into one consistent JSON shape:
 *   { success: false, message, errors? }
 *
 * WHY ONE PLACE? Consistent responses for the frontend, and no stack traces leaking
 * to users in production.
 */
import env from '../config/env.js';

// Express needs all 4 parameters to recognise an error handler, even though we never call
// `_next`. (The "_" prefix tells ESLint the unused parameter is intentional.)
export default function errorHandler(err, _req, res, _next) {
  // Start with what the error tells us (ApiError has statusCode/errors), else a 500
  let statusCode = err.statusCode || err.status || 500;
  let message = err.message || 'Something went wrong';
  let errors = Array.isArray(err.errors) ? err.errors : [];

  // Translate well-known library errors into friendly client errors
  if (err.name === 'ValidationError') {
    // Mongoose schema validation failed → 400 with one entry per field
    statusCode = 400;
    message = 'Validation failed';
    errors = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
  } else if (err.name === 'CastError') {
    // e.g. "abc" given where a MongoDB ObjectId was expected
    statusCode = 400;
    message = `Invalid ${err.path}`;
  } else if (err.code === 11000) {
    // MongoDB unique-index violation (e.g. same email twice at the same moment)
    const field = Object.keys(err.keyValue || {})[0] || 'value';
    statusCode = 409; // 409 Conflict
    message = `${field} already exists`;
    errors = [{ field, message }];
  } else if (err.name === 'MulterError') {
    // A file upload broke one of multer's limits (upload.middleware.js): too big, too many
    // files, or sent under the wrong form-field name. All are client mistakes → 400.
    statusCode = 400;
    message = err.code === 'LIMIT_FILE_SIZE' ? 'Each image must be 2 MB or less' : err.message;
    errors = [{ field: err.field || 'file', message }];
  } else if (err.type === 'entity.parse.failed') {
    // The request body was not valid JSON
    statusCode = 400;
    message = 'Invalid JSON body';
  }

  // 5xx = OUR bug. Log it for developers; hide the details from users in production.
  if (statusCode >= 500) {
    if (!env.isTest) console.error(err);
    if (env.isProduction) message = 'Something went wrong';
  }

  // Build the standard error body
  const body = { success: false, message };
  if (errors.length) body.errors = errors;
  // The stack trace helps while developing, but must never reach production users
  if (!env.isProduction && statusCode >= 500) body.stack = err.stack;
  res.status(statusCode).json(body);
}
