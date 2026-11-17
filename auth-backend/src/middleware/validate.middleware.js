import { validationResult } from 'express-validator';
import ApiError from '../utils/ApiError.js';

// Runs a list of express-validator rules. If anything fails → 400 with field errors.
export const validate = (rules) => async (req, _res, next) => {
  for (const rule of rules) {
    // eslint-disable-next-line no-await-in-loop
    await rule.run(req);
  }
  const result = validationResult(req);
  if (result.isEmpty()) return next();

  const errors = result.array({ onlyFirstError: true }).map((e) => ({ field: e.path, message: e.msg }));
  next(new ApiError(400, 'Validation failed', errors));
};
