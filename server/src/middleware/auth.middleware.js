/**
 * src/middleware/auth.middleware.js – AUTHENTICATION and AUTHORIZATION guards.
 *
 *   Authentication = "WHO are you?"        → protect
 *   Authorization  = "Are you ALLOWED?"    → authorize(...roles), requireVerifiedEmail
 *
 * Middleware is a function (req, res, next) that runs BEFORE the controller.
 * It either calls next() to let the request continue, or passes an error to stop it.
 *
 * Example route:
 *   router.get('/admin/stats', protect, authorize('admin'), controller);
 *   → protect sets req.user → authorize checks req.user.role → controller runs
 */
import jwt from 'jsonwebtoken';
import env from '../config/env.js';
import { User } from '../modules/models.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';

/**
 * protect – checks the login token and puts the user on `req.user`.
 * Expects the header:  Authorization: Bearer <token>
 */
export const protect = asyncHandler(async (req, _res, next) => {
  // 1) Read the header. `|| ''` avoids a crash when the header is missing.
  const header = req.headers.authorization || '';
  // 2) It must look like "Bearer abc.def.ghi"; take the part after the space.
  const token = header.startsWith('Bearer ') ? header.split(' ')[1] : null;
  if (!token) throw new ApiError(401, 'Not authorised, token missing');

  // 3) Verify the signature and the expiry date. jwt.verify throws if either is bad.
  let payload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET);
  } catch {
    // Same message for "fake" and "expired": attackers learn nothing useful.
    throw new ApiError(401, 'Not authorised, token invalid or expired');
  }

  // 4) Load the user FRESH from the database. Never trust only the token: the user
  //    may have been deleted or disabled after the token was created.
  const user = await User.findById(payload.id);
  if (!user) throw new ApiError(401, 'Not authorised, user no longer exists');
  if (!user.isActive) throw new ApiError(403, 'Account disabled');
  // 5) Tokens created BEFORE a password change are rejected (logs out stolen sessions).
  //    The token carries the user's tokenVersion from when it was made (payload.v).
  if (user.isTokenOutdated(payload.v)) {
    throw new ApiError(401, 'Password was changed, please log in again');
  }

  // 6) Success: share the user with the next middleware/controller
  req.user = user;
  next();
});

/**
 * authorize(...roles) – allows only the listed roles. Must run AFTER protect.
 * authorize('admin') returns a middleware function; that is why it is called with ().
 */
export const authorize =
  (...roles) =>
  (req, _res, next) => {
    // 403 Forbidden = "we know who you are, but you may not do this"
    if (!roles.includes(req.user.role)) return next(new ApiError(403, 'Access denied'));
    next();
  };

/**
 * requireVerifiedEmail – customers must click the email link before using some features
 * (business rule BR-12: e.g. placing an order). Admins are trusted and skip this check.
 */
export const requireVerifiedEmail = (req, _res, next) => {
  if (req.user.role === 'customer' && !req.user.isEmailVerified) {
    return next(new ApiError(403, 'Please verify your email address to continue'));
  }
  next();
};
