import env from '../config/env.js';

// The ONLY place that sends error responses. Controllers just throw.
// eslint-disable-next-line no-unused-vars
export default function errorHandler(err, _req, res, _next) {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Something went wrong';
  let errors = err.errors && Array.isArray(err.errors) ? err.errors : [];

  if (err.name === 'ValidationError') {
    // Mongoose validation error → list of field errors
    statusCode = 400;
    message = 'Validation failed';
    errors = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
  } else if (err.name === 'CastError') {
    statusCode = 400;
    message = `Invalid ${err.path}`;
  } else if (err.code === 11000) {
    // Unique index violation
    const field = Object.keys(err.keyValue || {})[0] || 'value';
    statusCode = 409;
    message = `${field} already exists`;
    errors = [{ field, message }];
  } else if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Invalid or expired token';
  } else if (err.type === 'entity.parse.failed') {
    statusCode = 400;
    message = 'Invalid JSON body';
  }

  if (statusCode >= 500) {
    console.error(err);
    if (env.isProduction) message = 'Something went wrong';
  }

  const body = { success: false, message };
  if (errors.length) body.errors = errors;
  if (!env.isProduction && statusCode >= 500) body.stack = err.stack;
  res.status(statusCode).json(body);
}
