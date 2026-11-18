/**
 * src/modules/auth/auth.validation.js – input rules for every auth route.
 *
 * express-validator: body('email') = "look at req.body.email", then chain checks.
 *   .bail()        → stop checking this field after the first failure
 *   .trim()        → also CLEANS the value (sanitizer), the controller gets the clean one
 *   .withMessage() → the message for the check right before it
 * The rules are executed by middleware/validate.middleware.js.
 */
import { body } from 'express-validator';

// Reusable email rule: must be text, then cleaned and checked
const email = body('email')
  .isString()
  .withMessage('Email is required')
  .bail()
  .trim()
  .toLowerCase() // store/search emails in one form
  .isEmail()
  .withMessage('Email is invalid');

// Password policy in ONE place (also used by users/user.validation.js for "change password").
// A function so the field name can differ: passwordRule('newPassword').
export const passwordRule = (field = 'password') =>
  body(field)
    .isString()
    .withMessage('Password is required')
    .bail()
    .isLength({ min: 8, max: 64 }) // 64 max: bcrypt only uses the first 72 bytes anyway
    .withMessage('Password must be 8–64 characters')
    .bail()
    .matches(/[A-Za-z]/) // at least one letter
    .withMessage('Password must contain a letter and a number')
    .matches(/\d/) // at least one digit
    .withMessage('Password must contain a letter and a number');

// POST /api/auth/register
export const registerRules = [
  body('name')
    .isString()
    .withMessage('Name is required')
    .bail()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be 2–50 characters'),
  email,
  passwordRule(),
  // NOTE: there is no rule for `role` on purpose. The service always creates customers,
  // so sending { role: 'admin' } has no effect ("mass assignment" protection).
];

// POST /api/auth/login and /api/auth/admin/login
export const loginRules = [
  email,
  // On login we only check "present". Policy checks would tell attackers the policy.
  body('password')
    .isString()
    .withMessage('Password is required')
    .bail()
    .notEmpty()
    .withMessage('Password is required'),
];

// POST /api/auth/forgot-password
export const emailOnlyRules = [email];

// POST /api/auth/verify-email
export const tokenRules = [
  body('token')
    .isString()
    .withMessage('Token is required')
    .bail()
    .isLength({ min: 10, max: 200 })
    .withMessage('Token is invalid'),
];

// POST /api/auth/reset-password = token + new password
export const resetPasswordRules = [...tokenRules, passwordRule()];

// POST /api/auth/google – the ID token ("credential") from Google's sign-in button
export const googleRules = [
  body('credential')
    .isString()
    .withMessage('Google credential is required')
    .bail()
    .notEmpty()
    .withMessage('Google credential is required'),
];
