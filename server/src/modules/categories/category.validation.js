/**
 * src/modules/categories/category.validation.js – input rules for the admin category routes.
 *
 * Create (POST) needs a name. Update (PUT) accepts any subset of fields, so an admin can
 * switch a category off with just { "isActive": false }. Everything else has the same rules.
 * The model repeats the important rules (defence in depth).
 * Run by middleware/validate.middleware.js before the controller (see category.routes.js).
 *
 * NOTE: there are NO rules for `slug`, `_id`, `createdAt`… The service never copies them
 * from the body: the slug is always built from the name (mass assignment protection).
 */
import { body } from 'express-validator';
import { REGEX } from '../../config/constants.js';

// The name rule, shared by create (required) and update (optional)
const nameRule = () =>
  body('name')
    .isString()
    .withMessage('Name is required')
    .bail() // stop here if it is not text: the next checks would make no sense
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be 2–50 characters');

// True when the client sent an image object (null means "remove the image")
const imageSent = (_value, { req }) => req.body.image !== undefined && req.body.image !== null;

// Every field except `name`: identical for create and update
const otherRules = [
  body('description')
    .optional()
    .isString()
    .withMessage('Description must be text')
    .bail()
    .trim()
    .isLength({ max: 300 })
    .withMessage('Description must be at most 300 characters'),
  // "" or null = top-level category (no parent). Otherwise a real ObjectId.
  body('parent').optional({ values: 'falsy' }).isMongoId().withMessage('Invalid parent category'),
  // null = remove the image; otherwise it must be an object { url, publicId }
  body('image').optional({ values: 'null' }).isObject().withMessage('Image must be an object'),
  // These two only run when an image object was sent (`.if(...)`)
  body('image.url')
    .if(imageSent)
    .isString()
    .withMessage('Image URL is required')
    .bail()
    .trim()
    .matches(REGEX.CLOUDINARY_URL)
    .withMessage('Image must be a Cloudinary URL'),
  body('image.publicId')
    .if(imageSent)
    .isString()
    .withMessage('Image publicId is required')
    .bail()
    .trim()
    .notEmpty()
    .withMessage('Image publicId is required'),
  // toBoolean()/toInt() turn "true"/"5" into real true/5 for the service
  body('isActive').optional().isBoolean().withMessage('isActive must be true or false').toBoolean(),
  body('sortOrder')
    .optional()
    .isInt({ min: 0, max: 1000 })
    .withMessage('Sort order must be a whole number 0–1000')
    .toInt(),
];

// POST /api/categories
export const createCategoryRules = [nameRule(), ...otherRules];

// PUT /api/categories/:id – the same rules, but `name` may be left out (partial update)
export const updateCategoryRules = [nameRule().optional(), ...otherRules];
