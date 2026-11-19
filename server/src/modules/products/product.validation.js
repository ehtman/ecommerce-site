/**
 * src/modules/products/product.validation.js – input rules for the admin product routes.
 *
 * `productRules` is used for BOTH create (POST) and update (PUT): the admin form always sends
 * the WHOLE product. The model repeats the important rules (defence in depth), but checking
 * here gives the admin one clear message per field before anything touches the database.
 * Run by middleware/validate.middleware.js (see product.routes.js).
 *
 * The public list (GET /api/products) has no rules on purpose: its query parameters are
 * optional filters, and product.query.js quietly ignores anything it does not understand.
 */
import { body } from 'express-validator';
import { LIMITS, REGEX } from '../../config/constants.js';

const MAX_PRICE = 10_000_000; // same cap as the model
const MAX_STOCK = 1_000_000; // a sanity limit for one product's stock

// POST /api/products and PUT /api/products/:id
export const productRules = [
  body('name')
    .isString()
    .withMessage('Name is required')
    .bail() // stop here if it is not text (the next checks would make no sense)
    .trim()
    .isLength({ min: 3, max: 120 })
    .withMessage('Name must be 3–120 characters'),
  body('description')
    .isString()
    .withMessage('Description is required')
    .bail()
    .trim()
    .isLength({ min: 20, max: 5000 })
    .withMessage('Description must be 20–5000 characters'),
  body('brand')
    .optional({ values: 'falsy' }) // "" or null = no brand
    .isString()
    .withMessage('Brand must be text')
    .bail()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Brand must be at most 50 characters'),
  body('sku')
    .isString()
    .withMessage('SKU is required')
    .bail()
    .trim()
    .toUpperCase() // "tshirt-01" → "TSHIRT-01" before the pattern check
    .matches(REGEX.SKU)
    .withMessage('SKU may contain A–Z, 0–9 and dashes (3–30 chars)'),
  // isInt: whole numbers only (see "money as whole numbers" in product.model.js).
  // toInt() turns "1500" into 1500 so the service receives a real number.
  body('price')
    .isInt({ min: 1, max: MAX_PRICE })
    .withMessage(`Price must be a whole number from 1 to ${MAX_PRICE}`)
    .toInt(),
  // Optional. "" (an empty form field) or null = "no compare-at price" (removes it on update).
  body('compareAtPrice')
    .optional({ values: 'null' })
    .custom((v) => v === '' || (Number.isInteger(Number(v)) && Number(v) >= 1))
    .withMessage('Compare-at price must be a whole number')
    .bail()
    .custom((v) => v === '' || Number(v) <= MAX_PRICE)
    .withMessage('Compare-at price is too high')
    .bail()
    .custom((v, { req }) => v === '' || Number(v) > Number(req.body.price))
    .withMessage('Compare-at price must be greater than price'),
  // A real ObjectId; the service then checks that this category exists
  body('category').isMongoId().withMessage('Category is required'),
  // Only on CREATE: the starting stock. Later changes go through PATCH /:id/stock (with a
  // reason, for the history), so the service ignores `stock` on update.
  body('stock')
    .optional()
    .isInt({ min: 0, max: MAX_STOCK })
    .withMessage('Stock must be a whole number ≥ 0')
    .toInt(),
  body('images')
    .isArray({ min: 1, max: LIMITS.MAX_PRODUCT_IMAGES })
    .withMessage(`Add 1–${LIMITS.MAX_PRODUCT_IMAGES} images`),
  // images.* = "every item of the images array". Each must come from POST /api/uploads/image.
  body('images.*.url')
    .isString()
    .bail()
    .matches(REGEX.CLOUDINARY_URL)
    .withMessage('Image must be a Cloudinary URL'),
  body('images.*.publicId')
    .isString()
    .bail()
    .trim()
    .notEmpty()
    .withMessage('Image publicId is required'),
  body('specifications')
    .optional()
    .isArray({ max: LIMITS.MAX_SPECIFICATIONS })
    .withMessage(`At most ${LIMITS.MAX_SPECIFICATIONS} specifications`),
  body('specifications.*.key')
    .isString()
    .bail()
    .trim()
    .isLength({ min: 1, max: 40 })
    .withMessage('Specification name is required (max 40)'),
  body('specifications.*.value')
    .isString()
    .bail()
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage('Specification value is required (max 200)'),
  body('isFeatured')
    .optional()
    .isBoolean()
    .withMessage('isFeatured must be true or false')
    .toBoolean(),
  body('isActive').optional().isBoolean().withMessage('isActive must be true or false').toBoolean(),
  // NOTE: no rules for slug, sold, ratingAverage, ratingCount, stockHistory or createdBy.
  // The service never copies them from the body (mass assignment protection).
];

// PATCH /api/products/:id/stock  { mode: 'adjust' | 'set', value, reason }
//   adjust: value is a CHANGE (+20 delivery, -2 damaged)
//   set:    value is the NEW TOTAL (after counting the shelf)
export const stockRules = [
  body('mode').isIn(['adjust', 'set']).withMessage('Mode must be adjust or set'),
  body('value')
    .isInt({ min: -MAX_STOCK, max: MAX_STOCK })
    .withMessage('Value must be a whole number')
    .toInt(),
  body('reason')
    .isString()
    .withMessage('Reason is required')
    .bail()
    .trim()
    .isLength({ min: 3, max: 100 })
    .withMessage('Reason must be 3–100 characters'),
];
