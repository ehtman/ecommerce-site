import jwt from 'jsonwebtoken';
import env from '../config/env.js';
import { User } from '../modules/models.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';

// protect – "who are you?"  Reads the Bearer token and attaches req.user
export const protect = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.split(' ')[1] : null;
  if (!token) throw new ApiError(401, 'Not authorised, token missing');

  let payload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET);
  } catch {
    throw new ApiError(401, 'Not authorised, token invalid or expired');
  }

  const user = await User.findById(payload.id);
  if (!user) throw new ApiError(401, 'Not authorised, user no longer exists');
  if (!user.isActive) throw new ApiError(403, 'Account disabled');
  if (user.changedPasswordAfter(payload.iat)) {
    throw new ApiError(401, 'Password was changed, please log in again');
  }

  req.user = user;
  next();
});

// authorize – "are you allowed?"  e.g. authorize('admin')
export const authorize = (...roles) => (req, _res, next) => {
  if (!roles.includes(req.user.role)) return next(new ApiError(403, 'Access denied'));
  next();
};

// BR-12: customers must verify their email before ordering
export const requireVerifiedEmail = (req, _res, next) => {
  if (req.user.role === 'customer' && !req.user.isEmailVerified) {
    return next(new ApiError(403, 'Please verify your email address before placing an order'));
  }
  next();
};
