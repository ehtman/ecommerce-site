/**
 * src/modules/users/user.validation.js – input rules for the users routes.
 * The password policy is REUSED from auth.validation.js, so there is one source of truth.
 * Run by middleware/validate.middleware.js before the controller (see user.routes.js).
 */
import { body } from 'express-validator';
import { passwordRule } from '../auth/auth.validation.js';
import { REGEX } from '../../config/constants.js';

// PUT /api/users/profile – a PARTIAL update: send only the fields you want to change.
// There are rules ONLY for `name` and `phone`. Other fields (email, role, isActive…) have
// no rule and are ignored by the service anyway ("mass assignment" protection).
export const updateProfileRules = [
  body('name')
    .optional() // missing = "don't change the name"
    .isString()
    .withMessage('Name must be 2–50 characters')
    .bail()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be 2–50 characters'),
  body('phone')
    // values: 'falsy' → also skip the checks for "" and null. The service treats those
    // as "remove my phone number", which is how a customer clears an optional field.
    .optional({ values: 'falsy' })
    .isString()
    .withMessage('Phone must be 03XXXXXXXXX')
    .bail()
    .trim()
    .matches(REGEX.PK_PHONE)
    .withMessage('Phone must be 03XXXXXXXXX'),
];

// PUT /api/users/password
export const changePasswordRules = [
  body('currentPassword')
    .isString()
    .withMessage('Current password is required')
    .bail()
    .notEmpty()
    .withMessage('Current password is required'),
  passwordRule('newPassword'), // same rules as registration
];
