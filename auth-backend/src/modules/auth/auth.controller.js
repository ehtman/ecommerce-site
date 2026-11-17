import asyncHandler from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/ApiResponse.js';
import generateToken from '../../utils/generateToken.js';
import * as authService from './auth.service.js';

const withToken = (user) => ({ token: generateToken(user), user });

export const register = asyncHandler(async (req, res) => {
  const user = await authService.registerUser(req.body);
  sendSuccess(res, 201, 'Registration successful. Please check your email to verify your account.', withToken(user));
});

export const login = asyncHandler(async (req, res) => {
  const user = await authService.loginUser(req.body.email, req.body.password);
  sendSuccess(res, 200, 'Login successful', withToken(user));
});

export const adminLogin = asyncHandler(async (req, res) => {
  const user = await authService.loginUser(req.body.email, req.body.password, { requireAdmin: true });
  sendSuccess(res, 200, 'Login successful', withToken(user));
});

export const googleLogin = asyncHandler(async (req, res) => {
  const user = await authService.googleLogin(req.body.credential);
  sendSuccess(res, 200, 'Login successful', withToken(user));
});

// JWTs are stateless: the client simply deletes its token.
export const logout = asyncHandler(async (_req, res) => {
  sendSuccess(res, 200, 'Logged out');
});

export const me = asyncHandler(async (req, res) => {
  sendSuccess(res, 200, 'Current user', req.user);
});

export const verifyEmail = asyncHandler(async (req, res) => {
  const user = await authService.verifyEmail(req.body.token);
  sendSuccess(res, 200, 'Email verified successfully', user);
});

export const resendVerification = asyncHandler(async (req, res) => {
  await authService.resendVerification(req.user._id);
  sendSuccess(res, 200, 'Verification email sent');
});

export const forgotPassword = asyncHandler(async (req, res) => {
  await authService.forgotPassword(req.body.email);
  sendSuccess(res, 200, 'If an account exists for this email, a reset link has been sent');
});

export const resetPassword = asyncHandler(async (req, res) => {
  await authService.resetPassword(req.body.token, req.body.password);
  sendSuccess(res, 200, 'Password reset successful. Please log in with your new password.');
});
