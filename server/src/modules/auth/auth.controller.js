/**
 * src/modules/auth/auth.controller.js – turns HTTP requests into service calls.
 *
 * Layers: routes → CONTROLLER → service → model.
 * A controller is THIN: read input from `req`, call ONE service function, send the
 * response with sendSuccess(). No business rules here. Errors are simply thrown;
 * asyncHandler forwards them to the central error handler.
 */
import asyncHandler from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/ApiResponse.js';
import generateToken from '../../utils/generateToken.js';
import * as authService from './auth.service.js';

// Login-style responses all return the same pair: a fresh JWT + the (cleaned) user
const withToken = (user) => ({ token: generateToken(user), user });

// POST /api/auth/register → 201 Created
export const register = asyncHandler(async (req, res) => {
  const user = await authService.registerUser(req.body);
  sendSuccess(
    res,
    201,
    'Registration successful. Please check your email to verify your account.',
    withToken(user),
  );
});

// POST /api/auth/login
export const login = asyncHandler(async (req, res) => {
  const user = await authService.loginUser(req.body.email, req.body.password);
  sendSuccess(res, 200, 'Login successful', withToken(user));
});

// POST /api/auth/admin/login – same as login, but only admins pass
export const adminLogin = asyncHandler(async (req, res) => {
  const user = await authService.loginUser(req.body.email, req.body.password, {
    requireAdmin: true,
  });
  sendSuccess(res, 200, 'Login successful', withToken(user));
});

// POST /api/auth/google
export const googleLogin = asyncHandler(async (req, res) => {
  const user = await authService.googleLogin(req.body.credential);
  sendSuccess(res, 200, 'Login successful', withToken(user));
});

// POST /api/auth/logout
// JWTs are "stateless": the server keeps no session to delete. The client logs out by
// deleting its token. (A token blocklist would be the next step for stricter apps.)
export const logout = asyncHandler(async (_req, res) => {
  sendSuccess(res, 200, 'Logged out');
});

// GET /api/auth/me – `protect` already loaded the user into req.user
export const me = asyncHandler(async (req, res) => {
  sendSuccess(res, 200, 'Current user', req.user);
});

// POST /api/auth/verify-email
export const verifyEmail = asyncHandler(async (req, res) => {
  const user = await authService.verifyEmail(req.body.token);
  sendSuccess(res, 200, 'Email verified successfully', user);
});

// POST /api/auth/resend-verification (logged in)
export const resendVerification = asyncHandler(async (req, res) => {
  await authService.resendVerification(req.user._id);
  sendSuccess(res, 200, 'Verification email sent');
});

// POST /api/auth/forgot-password – identical answer whether the email exists or not
export const forgotPassword = asyncHandler(async (req, res) => {
  await authService.forgotPassword(req.body.email);
  sendSuccess(res, 200, 'If an account exists for this email, a reset link has been sent');
});

// POST /api/auth/reset-password
export const resetPassword = asyncHandler(async (req, res) => {
  await authService.resetPassword(req.body.token, req.body.password);
  sendSuccess(res, 200, 'Password reset successful. Please log in with your new password.');
});
