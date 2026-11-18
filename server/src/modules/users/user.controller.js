/**
 * src/modules/users/user.controller.js – HTTP layer for /api/users routes.
 *
 * Layers: routes → CONTROLLER → service → model. Thin on purpose: read req, call one
 * service function, answer with sendSuccess. `req.user` was loaded by `protect`.
 */
import asyncHandler from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/ApiResponse.js';
import generateToken from '../../utils/generateToken.js';
import * as userService from './user.service.js';

// GET /api/users/profile – `protect` already loaded the (cleaned) user, nothing to look up
export const getProfile = asyncHandler(async (req, res) => {
  sendSuccess(res, 200, 'Profile fetched', req.user);
});

// PUT /api/users/profile – only name/phone; the service ignores every other field
export const updateProfile = asyncHandler(async (req, res) => {
  const user = await userService.updateProfile(req.user._id, req.body);
  sendSuccess(res, 200, 'Profile updated', user);
});

// PUT /api/users/password
export const changePassword = asyncHandler(async (req, res) => {
  const user = await userService.changePassword(
    req.user._id, // WHO: always from the verified token, never from the request body
    req.body.currentPassword,
    req.body.newPassword,
  );
  // Changing the password invalidates every OLD token (see protect), including the one
  // used for this request. So we hand back a fresh token to keep this user logged in.
  sendSuccess(res, 200, 'Password updated', { token: generateToken(user) });
});
