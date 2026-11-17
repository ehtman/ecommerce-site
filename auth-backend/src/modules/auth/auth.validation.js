import { body } from 'express-validator';

const email = body('email')
  .isString().withMessage('Email is required').bail()
  .trim().toLowerCase().isEmail().withMessage('Email is invalid');

export const passwordRule = (field = 'password') =>
  body(field)
    .isString().withMessage('Password is required').bail()
    .isLength({ min: 8, max: 64 }).withMessage('Password must be 8–64 characters').bail()
    .matches(/[A-Za-z]/).withMessage('Password must contain a letter and a number')
    .matches(/\d/).withMessage('Password must contain a letter and a number');

export const registerRules = [
  body('name').isString().withMessage('Name is required').bail()
    .trim().isLength({ min: 2, max: 50 }).withMessage('Name must be 2–50 characters'),
  email,
  passwordRule(),
];

export const loginRules = [
  email,
  body('password').isString().withMessage('Password is required').bail()
    .notEmpty().withMessage('Password is required'),
];

export const emailOnlyRules = [email];

export const tokenRules = [
  body('token').isString().withMessage('Token is required').bail()
    .isLength({ min: 10, max: 200 }).withMessage('Token is invalid'),
];

export const resetPasswordRules = [...tokenRules, passwordRule()];

export const googleRules = [
  body('credential').isString().withMessage('Google credential is required').bail().notEmpty(),
];
