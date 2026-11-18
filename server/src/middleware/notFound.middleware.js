/**
 * src/middleware/notFound.middleware.js – catches requests that matched NO route.
 *
 * It is registered after all routes in app.js, so it only runs when nothing else answered.
 * It turns the request into a 404 error for the central error handler.
 */
import ApiError from '../utils/ApiError.js';

export default function notFound(req, _res, next) {
  next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`));
}
