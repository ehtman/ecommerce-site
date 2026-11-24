/**
 * src/db/scripts/seed.js – fills an empty store with demo data. Run: `npm run seed`
 *
 * Creates: the admin (from ADMIN_* in .env), 14 categories (5 main + 9 sub-categories),
 * 30 products with pictures, and 2 coupons (WELCOME10, FLAT500).
 *
 * SEEDING = putting known starting data into a database, so a fresh install (or a new
 * teammate's laptop) shows a working shop instead of empty pages.
 *
 * IDEMPOTENT = running it twice gives the same result as running it once. Every record is
 * looked up by a NATURAL KEY first (admin → email, category → name, product → SKU,
 * coupon → code) and only created when missing. Nothing is overwritten, so changes an
 * admin made in the UI (a new price, extra stock) survive a re-run. The unique indexes on
 * those keys are the final safety net against duplicates.
 *
 * Images come from Cloudinary's public "demo" account, so no upload is needed.
 * Testable: `seedStore()` is exported and used by tests/integration/seed.test.js; the
 * connect/disconnect part only runs when this file is started from the command line.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import env from '../../config/env.js';
import { ROLES, COUPON_TYPES } from '../../config/constants.js';
import { User, Category, Product, Coupon } from '../../modules/models.js';

// ---------- The data (plain arrays: easy to read and to extend) ----------

// [name, description, sortOrder] for top-level categories
export const MAIN_CATEGORIES = [
  ['Electronics', 'Gadgets, audio and cameras', 1],
  ['Fashion', 'Clothing, shoes, bags and accessories', 2],
  ['Home & Kitchen', 'Everything for your home', 3],
  ['Sports & Outdoors', 'Get active outside', 4],
  ['Toys & Kids', 'Fun for all ages', 5],
];
// key → [name, description, parent name]; `key` is what the product list below refers to
export const SUB_CATEGORIES = {
  audio: ['Audio', 'Headphones and earbuds', 'Electronics'],
  cameras: ['Cameras', 'Film, instant and action cameras', 'Electronics'],
  bags: ['Bags', 'Messenger bags, totes and duffels', 'Fashion'],
  shoes: ['Shoes', 'Sneakers and running shoes', 'Fashion'],
  accessories: ['Accessories', 'Watches and sunglasses', 'Fashion'],
  clothing: ['Clothing', 'Shirts and outfits', 'Fashion'],
  kitchen: ['Kitchen', 'Cookware and dining', 'Home & Kitchen'],
  furniture: ['Furniture', 'Chairs and more', 'Home & Kitchen'],
  decor: ['Decor', 'Flowers and wall art', 'Home & Kitchen'],
};
// Products may also sit directly in a main category
const MAIN_KEYS = { sports: 'Sports & Outdoors', toys: 'Toys & Kids' };

// [name, brand, sku, price, compareAtPrice, stock, category key, Cloudinary demo image, featured]
// Prices are whole rupees. A few stocks are ≤ 5 on purpose, so the low-stock screens have data.
// prettier-ignore
export const PRODUCTS = [
  ['Wireless Over-Ear Headphones', 'SoundMax', 'SM-HP-100', 8999, 11999, 25, 'audio', 'docs/headphones', true],
  ['Bluetooth Earbuds Pro', 'SoundMax', 'SM-EB-200', 4999, 6499, 40, 'audio', 'docs/headphones'],
  ['Studio Monitor Headphones', 'AudioPro', 'AP-HP-300', 14500, null, 4, 'audio', 'docs/headphones'],
  ['Classic Film Camera', 'PixelCraft', 'PC-CAM-35', 24999, 29999, 8, 'cameras', 'docs/camera', true],
  ['Instant Camera Mini', 'PixelCraft', 'PC-CAM-MINI', 12999, null, 15, 'cameras', 'docs/camera'],
  ['Action Camera 4K', 'PixelCraft', 'PC-CAM-4K', 18999, 21999, 0, 'cameras', 'docs/camera'],
  ['Leather Messenger Bag Grey', 'UrbanCarry', 'UC-BAG-GRY', 7499, 8999, 20, 'bags', 'samples/ecommerce/leather-bag-gray', true],
  ['Canvas Tote Bag', 'UrbanCarry', 'UC-BAG-TOTE', 1999, null, 60, 'bags', 'samples/ecommerce/accessories-bag'],
  ['Travel Duffel Bag', 'UrbanCarry', 'UC-BAG-DUF', 5999, null, 12, 'bags', 'samples/ecommerce/leather-bag-gray'],
  ['Everyday Sneakers', 'StrideOn', 'SO-SNK-001', 6499, 7999, 30, 'shoes', 'samples/ecommerce/shoes', true],
  ['Running Shoes Lite', 'StrideOn', 'SO-RUN-002', 8499, null, 3, 'shoes', 'shoes'],
  ['Casual Canvas Shoes', 'StrideOn', 'SO-CNV-003', 3499, null, 25, 'shoes', 'docs/shoes'],
  ['Analog Classic Watch', 'TimeKeep', 'TK-WAT-CLS', 15999, 19999, 10, 'accessories', 'samples/ecommerce/analog-classic', true],
  ['Polarized Sunglasses', 'SunShade', 'SS-SUN-POL', 2999, 3999, 35, 'accessories', 'sunglasses'],
  ['Aviator Sunglasses', 'SunShade', 'SS-SUN-AVI', 3499, null, 18, 'accessories', 'sunglasses'],
  ['Cotton Crew T-Shirt', 'BasicWear', 'BW-TSH-001', 1499, 1999, 100, 'clothing', 'shirt'],
  ['Formal Oxford Shirt', 'BasicWear', 'BW-SHT-OXF', 3299, null, 45, 'clothing', 'shirt', true],
  ['Casual Outfit Set', 'BasicWear', 'BW-SET-001', 5499, null, 14, 'clothing', 'docs/models'],
  ['Ceramic Coffee Mug 350ml', 'HomeCraft', 'HC-MUG-350', 1200, 1500, 50, 'kitchen', 'coffee_cup'],
  ['Espresso Cup Set (2 pcs)', 'HomeCraft', 'HC-ESP-SET', 2199, null, 22, 'kitchen', 'coffee_cup'],
  ['Travel Coffee Tumbler', 'HomeCraft', 'HC-TMB-500', 1799, 2299, 5, 'kitchen', 'coffee_cup'],
  ['Modern Accent Chair', 'NestHome', 'NH-CHR-ACC', 21999, 25999, 6, 'furniture', 'docs/chair', true],
  ['Wooden Dining Chair', 'NestHome', 'NH-CHR-DIN', 9999, null, 16, 'furniture', 'docs/chair'],
  ['Yellow Tulip Bouquet', 'NestHome', 'NH-DEC-TUL', 1899, null, 30, 'decor', 'yellow_tulip'],
  ['Spring Flower Arrangement', 'NestHome', 'NH-DEC-FLW', 2499, 2999, 20, 'decor', 'flowers'],
  ['Decorative Flower Print', 'NestHome', 'NH-DEC-PRT', 3999, null, 9, 'decor', 'sample'],
  ['City Bicycle 26 inch', 'RideOn', 'RO-BIK-026', 45999, 52999, 5, 'sports', 'bike', true],
  ['Indoor Basketball', 'ProPlay', 'PP-BBL-007', 3299, null, 28, 'sports', 'basketball_shot'],
  ['Dinosaur Toy Figure', 'PlayFun', 'PF-DIN-001', 1299, 1599, 40, 'toys', 'small_dinosaur', true],
  ['Party Balloon Pack (50 pcs)', 'PlayFun', 'PF-BAL-050', 799, null, 80, 'toys', 'balloons'],
];

// Public demo pictures: https://res.cloudinary.com/demo/image/upload/<id>.jpg
const demoImage = (publicId) => ({
  url: `https://res.cloudinary.com/demo/image/upload/${publicId}.jpg`,
  publicId,
});

const DAY = 24 * 60 * 60 * 1000;

// ---------- Steps ----------

/** The admin account. Refuses to turn an existing CUSTOMER into an admin. */
async function seedAdmin() {
  const existing = await User.findOne({ email: env.ADMIN_EMAIL });
  if (existing && existing.role !== ROLES.ADMIN) {
    // Silently promoting a customer would be a privilege-escalation bug
    throw new Error(`${env.ADMIN_EMAIL} belongs to a CUSTOMER account. Use another ADMIN_EMAIL.`);
  }
  if (existing) return { admin: existing, created: false };
  // new User(...).save() → validation runs and the pre-save hook hashes the password
  const admin = await new User({
    name: env.ADMIN_NAME,
    email: env.ADMIN_EMAIL,
    password: env.ADMIN_PASSWORD,
    role: ROLES.ADMIN,
    isEmailVerified: true, // we trust the address we configured ourselves
  }).save();
  return { admin, created: true };
}

// "Find by natural key, else create" – the heart of an idempotent seed
async function findOrCreateCategory(name, description, parent = null, sortOrder = 0) {
  const existing = await Category.findOne({ name });
  if (existing) return { doc: existing, created: false };
  // Category.create runs the model hooks: slug generation and the two-level depth check
  return { doc: await Category.create({ name, description, parent, sortOrder }), created: true };
}

/**
 * Seeds everything. Expects an open mongoose connection.
 * @returns {Promise<{ admin: boolean, categories: number, products: number, coupons: number }>}
 *          how many records were CREATED by this run (0 everywhere on a second run)
 */
export async function seedStore() {
  const created = { admin: false, categories: 0, products: 0, coupons: 0 };

  const { admin, created: adminCreated } = await seedAdmin();
  created.admin = adminCreated;

  // Categories: parents first (children need their parent's _id). Sequential on purpose:
  // the steps depend on each other, and a seed favours clarity over speed.
  const byKey = {};
  const mainByName = {};
  for (const [name, description, sortOrder] of MAIN_CATEGORIES) {
    const { doc, created: isNew } = await findOrCreateCategory(name, description, null, sortOrder);
    mainByName[name] = doc;
    if (isNew) created.categories += 1;
  }
  for (const [key, [name, description, parentName]] of Object.entries(SUB_CATEGORIES)) {
    const parent = mainByName[parentName]._id;
    const { doc, created: isNew } = await findOrCreateCategory(name, description, parent);
    byKey[key] = doc;
    if (isNew) created.categories += 1;
  }
  for (const [key, name] of Object.entries(MAIN_KEYS)) byKey[key] = mainByName[name];

  // Products, keyed by SKU (the shop's own unique product code)
  for (const [
    name,
    brand,
    sku,
    price,
    compareAtPrice,
    stock,
    catKey,
    image,
    isFeatured = false,
  ] of PRODUCTS) {
    if (await Product.exists({ sku })) continue; // already there → leave it untouched
    await Product.create({
      name,
      brand,
      sku,
      price,
      stock,
      isFeatured,
      compareAtPrice: compareAtPrice ?? undefined, // null in the table = no "was" price
      description: `${name} by ${brand}. A quality product chosen for everyday use, with reliable materials and a clean, modern design. Delivered anywhere in Pakistan.`,
      category: byKey[catKey]._id,
      images: [demoImage(image)],
      specifications: [
        { key: 'Brand', value: brand },
        { key: 'Warranty', value: '7-day easy return' },
      ],
      createdBy: admin._id,
    });
    created.products += 1;
  }

  // Coupons, keyed by code. Valid for 90 days from the FIRST seed (not extended on re-runs).
  const coupons = [
    {
      code: 'WELCOME10',
      type: COUPON_TYPES.PERCENTAGE,
      value: 10,
      maxDiscount: 1000,
      minOrderAmount: 3000,
      description: '10% off orders over Rs 3,000 (max Rs 1,000)',
    },
    {
      code: 'FLAT500',
      type: COUPON_TYPES.FIXED,
      value: 500,
      minOrderAmount: 4000,
      usageLimit: 100,
      description: 'Rs 500 off orders over Rs 4,000',
    },
  ];
  for (const coupon of coupons) {
    if (await Coupon.exists({ code: coupon.code })) continue;
    await Coupon.create({
      ...coupon,
      expiresAt: new Date(Date.now() + 90 * DAY),
      createdBy: admin._id,
    });
    created.coupons += 1;
  }

  return created;
}

// ---------- Command-line entry point ----------
// True only for `node src/db/scripts/seed.js` (npm run seed), not when a test imports us
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  await mongoose.connect(env.MONGO_URI);
  try {
    console.log('Connected. Seeding…');
    const created = await seedStore();
    console.log(
      `✔ Admin: ${env.ADMIN_EMAIL}${created.admin ? ' (created)' : ' (already existed)'}`,
    );
    console.log(`✔ Categories: ${created.categories} new`);
    console.log(
      `✔ Products: ${created.products} new, ${PRODUCTS.length - created.products} already existed`,
    );
    console.log(`✔ Coupons: ${created.coupons} new (WELCOME10, FLAT500)`);
    console.log('✔ Seed complete');
  } catch (err) {
    console.error(`❌ Seed failed: ${err.message}`);
    process.exitCode = 1; // non-zero exit = failure (CI and scripts can detect it)
  } finally {
    await mongoose.disconnect(); // always close, even after an error
  }
}
