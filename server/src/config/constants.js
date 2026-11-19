/**
 * src/config/constants.js – fixed values (business rules) shared across the app.
 *
 * WHY: "Magic values" like 'admin' or 24 * 60 * 60 * 1000 scattered in many files are
 *      easy to mistype. Naming them once here makes the code readable and safe to change.
 *      Object.freeze() makes each object read-only, so no code can change it by accident.
 */

// Who a user is. Used by the User model (allowed values) and by authorize('admin').
export const ROLES = Object.freeze({ CUSTOMER: 'customer', ADMIN: 'admin' });

// HOW a user signs in: with our own email+password ("local") or with Google.
export const AUTH_PROVIDERS = Object.freeze({ LOCAL: 'local', GOOGLE: 'google' });

// How long the links we email stay valid (in milliseconds).
export const TOKEN_TTL = Object.freeze({
  EMAIL_VERIFY_MS: 24 * 60 * 60 * 1000, // 24 hours
  PASSWORD_RESET_MS: 30 * 60 * 1000, // 30 minutes: short, because a reset link is powerful
});

// Regular expressions (text patterns) used for validation.
export const REGEX = Object.freeze({
  // "something@something.something" with no spaces. Simple on purpose: the real
  // proof that an email works is the verification link we send to it.
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  // Pakistani mobile number: "03" + 9 more digits, e.g. 03001234567 (11 digits, no spaces).
  // Used by the user's profile phone AND the phone on each delivery address.
  PK_PHONE: /^03\d{9}$/,
  // Pakistani postal codes are exactly 5 digits, e.g. 54000 (Lahore).
  POSTAL_CODE: /^\d{5}$/,
  // A URL-friendly name ("slug"): lowercase letters and digits in groups joined by single
  // dashes, e.g. "mens-shoes". No spaces, no leading/trailing or double dashes.
  // See docs/concepts/15-slugs-and-public-vs-admin-apis.md.
  SLUG: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
  // Images must live on OUR Cloudinary account's CDN (https only). Branch 04 adds the real
  // upload endpoint; until then an admin stores an already-uploaded { url, publicId }.
  CLOUDINARY_URL: /^https:\/\/res\.cloudinary\.com\//,
  // A product's SKU ("Stock Keeping Unit", the shop's own article number, e.g. "TSHIRT-BLK-M"):
  // 3–30 capital letters, digits or dashes. Inputs are upper-cased first, so "tshirt-blk-m" is OK.
  SKU: /^[A-Z0-9-]{3,30}$/,
});

// The provinces/territories a delivery address may be in. A fixed list (an "enum")
// means the shop never receives typos like "Panjab" and can later price shipping by province.
export const PROVINCES = Object.freeze([
  'Punjab',
  'Sindh',
  'KPK',
  'Balochistan',
  'Islamabad',
  'GB',
  'AJK',
]);

// The small tag a customer puts on an address so they can recognise it in a list.
export const ADDRESS_LABELS = Object.freeze(['Home', 'Work', 'Other']);

// Upper limits that protect the database (and the UI) from unbounded lists.
export const LIMITS = Object.freeze({
  MAX_ADDRESSES: 5, // a customer may save at most 5 delivery addresses
  MAX_PRODUCT_IMAGES: 5, // a product shows 1 to 5 pictures
  MAX_SPECIFICATIONS: 20, // at most 20 "key: value" rows (e.g. "Material: Cotton") per product
  STOCK_HISTORY_KEEP: 50, // a product remembers only its last 50 manual stock changes
  LOW_STOCK_THRESHOLD: 5, // stock at or below this number shows up in the admin's low-stock list
  MAX_IMAGE_BYTES: 2 * 1024 * 1024, // an uploaded image may be at most 2 MB
});

// The only file types the upload endpoint accepts (checked by their MIME type, the
// "content type" label every uploaded file carries). No GIF/SVG: SVG files can contain scripts.
export const IMAGE_MIME_TYPES = Object.freeze(['image/jpeg', 'image/png', 'image/webp']);
