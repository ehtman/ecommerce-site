/**
 * src/middleware/validate.middleware.js – input checks that run before the controller.
 *
 * Two helpers live here:
 *   validate(rules)            → runs express-validator rules on body/query/params
 *   validateObjectId(...names) → checks that URL parameters such as `:id` are real MongoDB ids
 *
 * Request flow: route → (protect/authorize) → VALIDATE → controller → service.
 * Used by: every module's *.routes.js file.
 *
 * validate(rules)
 * Rules are written with express-validator in each module's *.validation.js file.
 * If any rule fails, the request stops here with 400 and a list of field errors:
 *   { success: false, message: 'Validation failed', errors: [{ field, message }] }
 *
 * WHY: "Never trust the client." Checking input at the edge keeps bad data out of the
 *      services and the database, and gives the frontend clear messages per field.
 */
import mongoose from 'mongoose';
import { validationResult } from 'express-validator';
import ApiError from '../utils/ApiError.js';

export const validate = (rules) => async (req, _res, next) => {
  // Run every rule one after another (rules can also clean values, e.g. trim, lowercase)
  for (const rule of rules) {
    await rule.run(req);
  }
  // Collect what failed
  const result = validationResult(req);
  if (result.isEmpty()) return next(); // all good → go to the controller

  // Keep only the FIRST error per field, in our standard { field, message } shape
  const errors = result
    .array({ onlyFirstError: true })
    .map((e) => ({ field: e.path, message: e.msg }));
  next(new ApiError(400, 'Validation failed', errors));
};

/**
 * validateObjectId('id') – checks URL parameters BEFORE they reach the database.
 *
 * An ObjectId is MongoDB's id type: 24 hexadecimal characters, e.g. 665f1c2e9b1e8a0012345678.
 * A URL like /api/addresses/abc is clearly not an id, so we stop it here with a clear 400
 * "Invalid id" instead of letting Mongoose fail later with a confusing CastError.
 *
 * Usage:  router.delete('/:id', validateObjectId('id'), controller)
 * You may pass several names: validateObjectId('productId', 'reviewId').
 */
export const validateObjectId =
  (...params) =>
  (req, _res, next) => {
    for (const name of params) {
      // isObjectIdOrHexString accepts only a real ObjectId or a 24-char hex string.
      // (mongoose.isValidObjectId is looser: it also says "yes" to ANY 12-character
      // string such as "hello-world!", which is why we do not use it.)
      if (!mongoose.isObjectIdOrHexString(req.params[name])) {
        return next(new ApiError(400, 'Invalid id', [{ field: name, message: 'Invalid id' }]));
      }
    }
    next(); // every id looks fine → continue
  };
