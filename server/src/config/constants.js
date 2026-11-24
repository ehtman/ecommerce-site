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
  // A coupon code: 3–20 CAPITAL letters or digits, e.g. EID25 or WELCOME500. No spaces or
  // symbols, so a code is easy to read aloud, type on a phone and print on a flyer.
  // Codes are stored in UPPERCASE, so customers may type "eid25" and still match.
  COUPON_CODE: /^[A-Z0-9]{3,20}$/,
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

// The two kinds of coupon (branch 06):
//   percentage → `value` is a percent of the items subtotal, e.g. 10 = 10% off
//   fixed      → `value` is a whole-rupee amount, e.g. 500 = Rs 500 off
export const COUPON_TYPES = Object.freeze({ PERCENTAGE: 'percentage', FIXED: 'fixed' });

// Upper limits that protect the database (and the UI) from unbounded lists.
export const LIMITS = Object.freeze({
  MAX_ADDRESSES: 5, // a customer may save at most 5 delivery addresses
  MAX_PRODUCT_IMAGES: 5, // a product shows 1 to 5 pictures
  MAX_SPECIFICATIONS: 20, // at most 20 "key: value" rows (e.g. "Material: Cotton") per product
  STOCK_HISTORY_KEEP: 50, // a product remembers only its last 50 manual stock changes
  LOW_STOCK_THRESHOLD: 5, // stock at or below this number shows up in the admin's low-stock list
  MAX_IMAGE_BYTES: 2 * 1024 * 1024, // an uploaded image may be at most 2 MB
  // BR-04: a customer may put at most 10 of ONE product in the cart (and never more than
  // the stock). Stops one buyer from emptying the shelf and keeps orders realistic.
  MAX_CART_QTY: 10,
  // A wishlist is a list of "maybe later" products. 100 is plenty and keeps it small.
  MAX_WISHLIST: 100,
  // Coupons (branch 06): the biggest discount an admin may configure. A typo such as
  // "value: 900" instead of "90" must never give away the whole shop.
  COUPON_MAX_PERCENT: 90, // a percentage coupon gives at most 90% off
  COUPON_MAX_FIXED: 100_000, // a fixed coupon gives at most Rs 100,000 off
});

// Money rules. All amounts are WHOLE RUPEES (integers): no paisa, no 0.1 + 0.2 surprises.
// Used by utils/pricing.js (cart totals now, order totals in branch 07).
export const PRICING = Object.freeze({
  SHIPPING_FEE: 250, // BR-02: flat delivery fee in Rs…
  FREE_SHIPPING_MIN: 5000, // BR-02: …which is FREE when the subtotal is Rs 5,000 or more
  TAX_RATE: 0, // BR-03: prices already include tax, so no tax line is added
});

// The only file types the upload endpoint accepts (checked by their MIME type, the
// "content type" label every uploaded file carries). No GIF/SVG: SVG files can contain scripts.
export const IMAGE_MIME_TYPES = Object.freeze(['image/jpeg', 'image/png', 'image/webp']);

/* ---------- Orders (branch 07) ---------- */

// Every state an order can be in. An order is a small "state machine": it is always in
// exactly ONE of these states and may only move along the arrows in ORDER_TRANSITIONS.
// See docs/concepts/21-state-machines-and-snapshots.md.
export const ORDER_STATUS = Object.freeze({
  PENDING: 'pending', // just placed, nobody has looked at it yet
  CONFIRMED: 'confirmed', // the shop accepted it
  PROCESSING: 'processing', // being packed
  SHIPPED: 'shipped', // handed to the courier (needs a tracking number)
  DELIVERED: 'delivered', // final: the customer has it (COD becomes "paid" here)
  CANCELLED: 'cancelled', // final: stock and coupon use were given back
});

// BR-08: the allowed NEXT statuses for each status (the arrows of the state machine).
// Anything not listed is refused, e.g. delivered → pending, or shipped → cancelled.
// Final states have an empty list: nothing can happen after them.
export const ORDER_TRANSITIONS = Object.freeze({
  pending: Object.freeze(['confirmed', 'cancelled']),
  confirmed: Object.freeze(['processing', 'cancelled']),
  processing: Object.freeze(['shipped', 'cancelled']),
  shipped: Object.freeze(['delivered']),
  delivered: Object.freeze([]),
  cancelled: Object.freeze([]),
});

// BR-06: a CUSTOMER may cancel only before the shop starts packing.
// (An admin may still cancel while processing; see ORDER_TRANSITIONS.)
export const CUSTOMER_CANCELLABLE = Object.freeze(['pending', 'confirmed']);

// How the customer pays. COD = Cash on Delivery (works now). CARD = Stripe (branch 08).
export const PAYMENT_METHODS = Object.freeze({ COD: 'COD', CARD: 'CARD' });

// Where the money is. COD orders stay "pending" until delivery, then become "paid".
export const PAYMENT_STATUS = Object.freeze({
  PENDING: 'pending',
  PAID: 'paid',
  FAILED: 'failed',
  REFUNDED: 'refunded',
});

// Card payments (branch 08). Stripe works in the SMALLEST unit of a currency ("paisa" for
// rupees, cents for dollars), so Rs 1,250 is sent to Stripe as 125000.
export const PAYMENTS = Object.freeze({
  PROVIDER: 'stripe', // the only payment provider we talk to (stored on the order)
  CURRENCY: 'pkr', // ISO currency code in lower case, as Stripe expects
  MINOR_UNITS_PER_RUPEE: 100, // 1 rupee = 100 paisa
  // A CARD order that is still unpaid after this long is cancelled by the expiry job and
  // its stock goes back on the shelf, so abandoned checkouts cannot block stock forever.
  UNPAID_CARD_EXPIRY_MS: 30 * 60 * 1000, // 30 minutes
  // Stripe events that mean "the money arrived" (async = slower methods that finish later)
  PAID_EVENTS: Object.freeze([
    'checkout.session.completed',
    'checkout.session.async_payment_succeeded',
  ]),
});
