/**
 * src/modules/auth/auth.routes.js – the URL map of the auth module.
 *
 * Each line reads left to right like a pipeline:
 *   router.post(PATH, ...middleware, controller)
 *   e.g. rate limit → validate input → controller
 * Mounted in app.js under /api/auth, so '/login' becomes POST /api/auth/login.
 */
import { Router } from 'express';
import { protect } from '../../middleware/auth.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import {
  authLimiter,
  adminLoginLimiter,
  emailLimiter,
} from '../../middleware/rateLimit.middleware.js';
import * as c from './auth.controller.js';
import * as v from './auth.validation.js';

const router = Router();

// ----- Public: anyone can call these (rate limited against brute force) -----
router.post('/register', authLimiter, validate(v.registerRules), c.register);
router.post('/login', authLimiter, validate(v.loginRules), c.login);
router.post('/admin/login', adminLoginLimiter, validate(v.loginRules), c.adminLogin);
router.post('/google', authLimiter, validate(v.googleRules), c.googleLogin);

// ----- Logged in: `protect` must succeed first -----
router.post('/logout', protect, c.logout);
router.get('/me', protect, c.me);

// ----- Email links (public, because the user clicks them from their mailbox) -----
router.post('/verify-email', validate(v.tokenRules), c.verifyEmail);
router.post('/resend-verification', protect, emailLimiter, c.resendVerification);
router.post('/forgot-password', emailLimiter, validate(v.emailOnlyRules), c.forgotPassword);
router.post('/reset-password', authLimiter, validate(v.resetPasswordRules), c.resetPassword);

export default router;
