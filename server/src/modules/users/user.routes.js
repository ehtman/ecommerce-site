/**
 * src/modules/users/user.routes.js – routes for the logged-in user's own account.
 * Mounted at /api/users in app.js. Customers AND admins may use them (no `authorize`):
 * everyone has a profile and a password. There is no `:id` in these URLs on purpose:
 * "my" account is always the one in the token, so nobody can ask for another user's.
 */
import { Router } from 'express';
import { protect } from '../../middleware/auth.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import * as c from './user.controller.js';
import * as v from './user.validation.js';

const router = Router();

// router.use(protect) applies `protect` to EVERY route below this line
router.use(protect);
router.get('/profile', c.getProfile);
router.put('/profile', validate(v.updateProfileRules), c.updateProfile);
router.put('/password', validate(v.changePasswordRules), c.changePassword);

export default router;
