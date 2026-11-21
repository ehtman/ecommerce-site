/**
 * tests/helpers/factories.js – small helpers that create test data and log users in.
 *
 * "Factories" keep tests short and readable: a test says WHAT it needs
 * ("a verified customer") instead of repeating HOW to build one each time.
 */
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../../src/app.js';
import {
  User,
  Address,
  Category,
  Product,
  Cart,
  Wishlist,
  Coupon,
  Order,
} from '../../src/modules/models.js';
import { calcTotals } from '../../src/utils/pricing.js';
import generateToken from '../../src/utils/generateToken.js';
import { outbox } from '../../src/emails/sendEmail.js';

export const PASSWORD = 'secret123'; // a valid password used across tests

let counter = 0;
// A unique email per call, so tests never collide on the unique index
export const uniqueEmail = (prefix = 'user') => `${prefix}${Date.now()}${(counter += 1)}@test.com`;

/** Creates a user directly in the database (fast, skips the HTTP layer). */
export async function createUser(overrides = {}) {
  return new User({
    name: 'Test User',
    email: uniqueEmail(),
    password: PASSWORD,
    isEmailVerified: true,
    ...overrides, // let each test change any field
  }).save();
}

/** Creates an admin. */
export const createAdmin = (overrides = {}) =>
  createUser({ name: 'Admin', role: 'admin', ...overrides });

/** Returns a ready-to-use "Bearer <jwt>" header value for a user. */
export const bearer = (user) => `Bearer ${generateToken(user)}`;

/** Creates a user and returns { user, auth } where auth is the Authorization header. */
export async function loggedIn(overrides = {}) {
  const user = await createUser(overrides);
  return { user, auth: bearer(user) };
}

/**
 * A complete, valid address body (what the frontend's address form sends).
 * Spread it and override what a test cares about: { ...validAddress(), city: 'Karachi' }.
 */
export const validAddress = (overrides = {}) => ({
  label: 'Home',
  fullName: 'Ali Khan',
  phone: '03001234567',
  addressLine1: 'House 12, Street 4, Gulberg III',
  city: 'Lahore',
  province: 'Punjab',
  postalCode: '54000',
  ...overrides,
});

/**
 * Saves an address for `user` directly in the database (skips the HTTP layer and its
 * rules, so tests can set up any state, e.g. "already 5 addresses").
 */
export const createAddress = (user, overrides = {}) =>
  Address.create({ ...validAddress(), user: user._id, ...overrides });

let categoryCounter = 0;
/**
 * Saves a category directly in the database (the slug hook still runs).
 * Each call gets a unique name, so tests never collide on the unique name index.
 * Override anything: createCategory({ name: 'Shoes', parent: men._id, isActive: false }).
 */
export const createCategory = (overrides = {}) =>
  Category.create({ name: `Category ${Date.now()}-${(categoryCounter += 1)}`, ...overrides });

let productCounter = 0;
// A Cloudinary-looking image (the url must match REGEX.CLOUDINARY_URL). Nothing is uploaded.
export const fakeImage = (name = 'sample') => ({
  url: `https://res.cloudinary.com/demo/image/upload/shopease/products/${name}.jpg`,
  publicId: `shopease/products/${name}`,
});

/**
 * A complete, valid product BODY (what the admin form sends to POST/PUT /api/products).
 * `category` must be an existing category id. SKU is unique per call.
 */
export const validProduct = (category, overrides = {}) => {
  productCounter += 1;
  return {
    name: `Test Product ${productCounter}`,
    description: 'A comfortable test product with a long enough description.',
    brand: 'TestBrand',
    sku: `SKU-${Date.now()}-${productCounter}`,
    price: 1000,
    category: String(category),
    stock: 20,
    images: [fakeImage(`img-${productCounter}`)],
    ...overrides,
  };
};

/**
 * Saves a product directly in the database (skips HTTP and its rules).
 * Creates a category automatically when `category` is not given.
 * Defaults: stock 20, price 1000, isActive true.
 */
export async function createProduct(overrides = {}) {
  const category = overrides.category ?? (await createCategory())._id;
  return Product.create({
    ...validProduct(category),
    category,
    isActive: true,
    // The creator must be an admin id; a fresh id is enough for most tests
    createdBy: new mongoose.Types.ObjectId(),
    ...overrides,
  });
}

/**
 * Puts `quantity` of `product` in the user's cart directly in the database (no HTTP, no
 * stock check), so a test can start from any cart state. Same product again → quantities add.
 * Returns the saved cart document.
 */
export async function addToCart(user, product, quantity = 1) {
  const cart = await Cart.forUser(user._id); // get or create (upsert)
  const line = cart.items.find((i) => String(i.product) === String(product._id));
  if (line) line.quantity += quantity;
  else cart.items.push({ product: product._id, quantity });
  return cart.save();
}

/**
 * Sets the user's wishlist to exactly `products` (documents or ids), directly in the
 * database. Returns the wishlist document.
 */
export const createWishlist = (user, products = []) =>
  Wishlist.findOneAndUpdate(
    { user: user._id },
    { $set: { products: products.map((p) => p._id || p) } },
    { upsert: true, new: true },
  );

/** The supertest client for our app (no real network port needed). */
export const api = () => request(app);

/**
 * Reads the token from the most recent email sent to `email`.
 * Emails contain links like http://localhost:5173/verify-email?token=abc…
 */
export function tokenFromLastEmail(email) {
  const mail = [...outbox].reverse().find((m) => m.to === email);
  if (!mail) throw new Error(`No email sent to ${email}`);
  const match = mail.text.match(/token=([a-f0-9]+)/);
  return match ? match[1] : null;
}

/* ---------- Coupons (branch 06) ---------- */
let couponSeq = 0;
// A unique, VALID code per call: letters/digits only, at most 20 characters (e.g. "TLX3K9A2B1")
export const uniqueCouponCode = (prefix = 'T') =>
  `${prefix}${Date.now().toString(36)}${(couponSeq += 1)}`.toUpperCase().slice(0, 20);

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Saves a coupon directly in the database: by default an ACTIVE 10% coupon that started a
 * minute ago and expires in 30 days, unlimited uses, no minimum order. Override anything:
 *   createCoupon({ type: 'fixed', value: 500 })
 *   createCoupon({ startsAt: past, expiresAt: yesterday })  // an expired coupon
 * `createdBy` defaults to a fresh admin.
 */
export async function createCoupon(overrides = {}) {
  const createdBy = overrides.createdBy || (await createAdmin())._id;
  return Coupon.create({
    code: uniqueCouponCode(),
    type: 'percentage',
    value: 10,
    startsAt: new Date(Date.now() - 60 * 1000),
    expiresAt: new Date(Date.now() + 30 * DAY_MS),
    ...overrides,
    createdBy,
  });
}

/* ---------- Orders (branch 07) ---------- */

/**
 * Saves an order for `user` directly in the database (skips checkout: no stock is taken,
 * no cart or coupon is touched). It holds a valid snapshot of ONE product line.
 * Overrides: `product` (a Product document; one is created when missing), `quantity`
 * (default 1), and any Order field, e.g. { status: 'shipped', trackingNumber: 'TCS1' }.
 * The status is 'pending' unless overridden.
 */
export async function createOrder(user, overrides = {}) {
  const { product: given, quantity = 1, ...rest } = overrides;
  const product = given || (await createProduct());
  // The snapshot line, exactly as checkout would build it
  const item = {
    product: product._id,
    name: product.name,
    slug: product.slug,
    sku: product.sku,
    image: product.images[0].url,
    price: product.price,
    quantity,
    subtotal: product.price * quantity,
  };
  const { fullName, phone, addressLine1, city, province, postalCode } = validAddress();
  return Order.create({
    user: user._id,
    items: [item],
    shippingAddress: { fullName, phone, addressLine1, city, province, postalCode },
    paymentMethod: 'COD',
    ...calcTotals(item.subtotal), // itemsPrice, discountPrice, shippingPrice, taxPrice, totalPrice
    ...rest,
  });
}

/** Marks an order as delivered (COD → paid), as if it went through every status. */
export async function deliverOrder(order) {
  const doc = await Order.findById(order._id);
  doc.status = 'delivered';
  doc.deliveredAt = new Date();
  doc.paymentStatus = 'paid';
  doc.paidAt = new Date();
  doc.trackingNumber = doc.trackingNumber || 'TRACK-TEST';
  doc.statusHistory.push({ status: 'delivered', note: 'Delivered (test factory)' });
  return doc.save();
}
