/**
 * src/modules/addresses/address.validation.js – input rules for the address routes.
 *
 * The same rules are used for "create" (POST) and "update" (PUT), because the frontend
 * always sends the WHOLE address form. The model repeats the most important rules, so bad
 * data cannot be saved even by code that skips this file (defence in depth).
 * Run by middleware/validate.middleware.js before the controller (see address.routes.js).
 */
import { body } from 'express-validator';
import { PROVINCES, ADDRESS_LABELS, REGEX } from '../../config/constants.js';

// Small helper for the many "required text between min and max characters" fields
const requiredText = (field, min, max, label) =>
  body(field)
    .isString()
    .withMessage(`${label} is required`)
    .bail()
    .trim()
    .isLength({ min, max })
    .withMessage(`${label} must be ${min}–${max} characters`);

// POST /api/addresses and PUT /api/addresses/:id
export const addressRules = [
  body('label')
    .optional() // the model defaults it to 'Home'
    .isIn(ADDRESS_LABELS)
    .withMessage(`Label must be one of: ${ADDRESS_LABELS.join(', ')}`),
  requiredText('fullName', 2, 60, 'Full name'),
  body('phone')
    .isString()
    .withMessage('Phone is required')
    .bail()
    .trim()
    .matches(REGEX.PK_PHONE)
    .withMessage('Phone must be 03XXXXXXXXX'),
  requiredText('addressLine1', 5, 120, 'Address line 1'),
  body('addressLine2')
    .optional({ values: 'falsy' }) // "" or null = no second line
    .isString()
    .withMessage('Address line 2 must be text')
    .bail()
    .trim()
    .isLength({ max: 120 })
    .withMessage('Address line 2 must be at most 120 characters'),
  requiredText('city', 2, 50, 'City'),
  body('province')
    .isIn(PROVINCES)
    .withMessage(`Province must be one of: ${PROVINCES.join(', ')}`),
  body('postalCode')
    .isString()
    .withMessage('Postal code is required')
    .bail()
    .trim()
    .matches(REGEX.POSTAL_CODE)
    .withMessage('Postal code must be 5 digits'),
  // Optional wish "make this my default". toBoolean() turns "true"/"false" into real booleans.
  body('isDefault')
    .optional()
    .isBoolean()
    .withMessage('isDefault must be true or false')
    .toBoolean(),
  // NOTE: no rules for `user`, `country` or `_id`. The service never reads them from the
  // body: the owner always comes from the token (mass assignment protection).
];
