import { Router } from 'express';
import { protect } from '../../middleware/auth.middleware.js';
import { validate } from '../../middleware/validate.middleware.js';
import * as c from './user.controller.js';
import * as v from './user.validation.js';

const router = Router();

router.use(protect);
router.put('/password', validate(v.changePasswordRules), c.changePassword);

export default router;
