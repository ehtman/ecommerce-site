import { body } from 'express-validator';
import { passwordRule } from '../auth/auth.validation.js';

export const changePasswordRules = [
  body('currentPassword').isString().notEmpty().withMessage('Current password is required'),
  passwordRule('newPassword'),
];
