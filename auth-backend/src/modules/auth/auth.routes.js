import { Router } from 'express';
import { protect } from '../../middleware/auth.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import { authLimiter, adminLoginLimiter, emailLimiter } from '../../middleware/rateLimit.middleware.js';
import * as c from './auth.controller.js';
import * as v from './auth.validation.js';

const router = Router();

router.post('/register', authLimiter, validate(v.registerRules), c.register);
router.post('/login', authLimiter, validate(v.loginRules), c.login);
router.post('/admin/login', adminLoginLimiter, validate(v.loginRules), c.adminLogin);
router.post('/google', authLimiter, validate(v.googleRules), c.googleLogin);
router.post('/logout', protect, c.logout);
router.get('/me', protect, c.me);

router.post('/verify-email', validate(v.tokenRules), c.verifyEmail);
router.post('/resend-verification', protect, emailLimiter, c.resendVerification);
router.post('/forgot-password', emailLimiter, validate(v.emailOnlyRules), c.forgotPassword);
router.post('/reset-password', authLimiter, validate(v.resetPasswordRules), c.resetPassword);

export default router;
