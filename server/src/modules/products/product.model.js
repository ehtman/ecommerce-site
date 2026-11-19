/**
 * src/modules/products/product.model.js – the Product collection: everything the shop sells.
 *
 * WHAT: One document per product: name, slug, description, brand, SKU, price, images,
 *       stock, specifications, rating numbers, flags (active/featured) and a stock history.
 * WHY:  The catalogue is the heart of a shop. Cart (05), orders (07) and reviews (09) all
 *       point at products by id.
 * WHERE: routes → controller → service → MODEL → MongoDB. Used by product.service.js (and
 *        later by cart, order and review services).
 *
 * New ideas in this file:
 *  - MONEY AS WHOLE NUMBERS: prices are whole rupees (integers). Floating-point numbers can't
 *    store most decimals exactly (0.1 + 0.2 = 0.30000000000000004), which is unacceptable
 *    for money. Shops that need paisa/cents store the SMALLEST unit as an integer instead.
 *  - QUERY INDEXES: each index below matches one way the shop LISTS products (filter + sort).
 *  - A TEXT INDEX for keyword search across name, brand and description.
 *  - ATOMIC STOCK UPDATES: stock changes use $inc with a condition, in ONE database command,
 *    so two shoppers can never buy the last item twice.
 * See docs/concepts/16-catalog-queries.md.
 */
import mongoose from 'mongoose';
import toJSON from '../../db/plugins/toJSON.js';
import imageSchema from '../../db/schemas/image.schema.js';
import { uniqueSlug } from '../../db/utils/slugify.js';
import { LIMITS, REGEX } from '../../config/constants.js';

const { Schema } = mongoose;

// Reusable rule: "must be a whole number". {PATH} is replaced by the field name.
const isInt = { validator: Number.isInteger, message: '{PATH} must be a whole number' };
// The biggest price we accept (1 crore rupees): stops typos such as an extra five zeros
const MAX_PRICE = 10_000_000;

// One row of the "Specifications" table on the product page, e.g. { key: 'Material', value: 'Cotton' }.
// _id: false → these small rows don't need their own ids.
const specificationSchema = new Schema(
  {
    key: { type: String, required: true, trim: true, maxlength: 40 },
    value: { type: String, required: true, trim: true, maxlength: 200 },
  },
  { _id: false },
);

// One MANUAL stock change by an admin ("+20, new delivery", "-2, damaged in storage").
// An audit trail: later you can answer "who changed this stock, when and why?"
const stockHistorySchema = new Schema(
  {
    change: { type: Number, required: true, validate: isInt }, // e.g. +20 or -3
    reason: { type: String, required: true, trim: true, minlength: 3, maxlength: 100 },
    by: { type: Schema.Types.ObjectId, ref: 'User', required: true }, // the admin
    at: { type: Date, default: Date.now }, // when
  },
  { _id: false },
);

const productSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true,
      minlength: [3, 'Name must be at least 3 characters'],
      maxlength: [120, 'Name must be at most 120 characters'],
    },
    // Built from the name by the hook below ("Blue Cotton Shirt" → "blue-cotton-shirt").
    // The PUBLIC product page is /products/<slug>. `unique` creates a unique index.
    slug: { type: String, unique: true, lowercase: true, match: REGEX.SLUG },
    description: {
      type: String,
      required: [true, 'Description is required'],
      trim: true,
      minlength: [20, 'Description must be at least 20 characters'],
      maxlength: [5000, 'Description must be at most 5000 characters'],
    },
    brand: { type: String, trim: true, maxlength: [50, 'Brand must be at most 50 characters'] },
    // The shop's own article number. Unique: two products can never share one.
    // uppercase: true stores "tshirt-01" as "TSHIRT-01", so the uniqueness ignores case.
    sku: {
      type: String,
      required: [true, 'SKU is required'],
      unique: true,
      uppercase: true,
      trim: true,
      match: [REGEX.SKU, 'SKU may contain A–Z, 0–9 and dashes (3–30 chars)'],
    },
    // What the customer pays, in whole rupees
    price: {
      type: Number,
      required: [true, 'Price is required'],
      min: [1, 'Price must be at least 1'],
      max: [MAX_PRICE, 'Price is too high'],
      validate: isInt,
    },
    // Optional "was" price shown crossed out (Rs 2,500 → Rs 1,999). Must be HIGHER than price,
    // otherwise the "discount" would be a lie.
    compareAtPrice: {
      type: Number,
      min: [1, 'Compare-at price must be at least 1'],
      max: [MAX_PRICE, 'Compare-at price is too high'],
      validate: [
        isInt,
        {
          // Runs on document.save() (the service always saves documents, never update queries,
          // for product edits). In an update query `this` is not the product, so we let it pass.
          validator(value) {
            if (value == null || this.price == null) return true;
            return value > this.price;
          },
          message: 'Compare-at price must be greater than price',
        },
      ],
    },
    // Which category the product is in (branch 03). `ref` lets the service populate it.
    category: {
      type: Schema.Types.ObjectId,
      ref: 'Category',
      required: [true, 'Category is required'],
    },
    // 1–5 images. Each one is { _id, url, publicId } (db/schemas/image.schema.js). The FIRST
    // image is the main picture on product cards.
    images: {
      type: [imageSchema],
      validate: {
        validator: (list) => list.length >= 1 && list.length <= LIMITS.MAX_PRODUCT_IMAGES,
        message: `A product needs 1–${LIMITS.MAX_PRODUCT_IMAGES} images`,
      },
    },
    // How many items are in the warehouse. Never negative (the min rule AND the stock
    // statics below make sure of that).
    stock: {
      type: Number,
      required: true,
      default: 0,
      min: [0, 'Stock cannot be negative'],
      validate: isInt,
    },
    // How many have been sold (increased by orders in branch 07). Used for "popular" sorting.
    sold: { type: Number, default: 0, min: 0, validate: isInt },
    specifications: {
      type: [specificationSchema],
      default: [],
      validate: {
        validator: (list) => list.length <= LIMITS.MAX_SPECIFICATIONS,
        message: `At most ${LIMITS.MAX_SPECIFICATIONS} specifications`,
      },
    },
    // Kept up to date by reviews (branch 09). Stored here (a "denormalised" copy) so lists can
    // sort and filter by rating without reading every review each time.
    ratingAverage: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
      set: (v) => Math.round(v * 10) / 10, // 4.4666 → 4.5 (one decimal)
    },
    ratingCount: { type: Number, default: 0, min: 0 },
    isFeatured: { type: Boolean, default: false }, // shown on the home page
    // false = hidden from the shop (a "soft" switch-off). Public routes only ever show
    // active products; admins see everything.
    isActive: { type: Boolean, default: true },
    // select: false → normal queries never load it (it can grow to 50 entries);
    // the admin detail view asks for it with .select('+stockHistory')
    stockHistory: { type: [stockHistorySchema], default: [], select: false },
    // The admin who created the product (from the token, never from the body)
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }, // createdAt (used for "newest" sorting) and updatedAt
);

/* ---------- Indexes ----------
 * An index is a sorted list MongoDB keeps next to the collection, so it can jump straight
 * to matching documents instead of reading ALL of them (a "collection scan").
 * A COMPOUND index such as { isActive: 1, createdAt: -1 } serves queries that FILTER on the
 * first field and SORT on the next one: "active products, newest first". So we add one
 * index per common listing. Indexes are not free: every write must update them too, so we
 * only add the ones our queries really use. See docs/concepts/16-catalog-queries.md. */
productSchema.index({ category: 1, isActive: 1, price: 1 }); // a category page, price filter
productSchema.index({ isActive: 1, createdAt: -1 }); // sort=newest (the default)
productSchema.index({ isActive: 1, price: 1 }); // sort=price_asc / price_desc
productSchema.index({ isActive: 1, ratingAverage: -1 }); // sort=rating
productSchema.index({ isActive: 1, sold: -1 }); // sort=popular
productSchema.index({ isActive: 1, isFeatured: 1 }); // home page "featured"
productSchema.index({ isActive: 1, stock: 1 }); // admin low-stock list
// A TEXT index splits these fields into words, so `$text: { $search: 'cotton shirt' }` finds
// products containing those words (also "shirts": English word stems are matched).
// Weights rank the matches: a word in the NAME counts 10×, in the brand 5×, description 1×.
// A collection may have only ONE text index, so it gets a fixed name.
productSchema.index(
  { name: 'text', brand: 'text', description: 'text' },
  { weights: { name: 10, brand: 5, description: 1 }, name: 'product_text_search' },
);

/* ---------- Virtuals (computed fields, not stored; included in JSON by the toJSON plugin) ---------- */
// "In stock" badge on the product page
productSchema.virtual('inStock').get(function inStock() {
  return this.stock > 0;
});
// "-20%" badge: how much cheaper than the compare-at price, rounded to a whole percent
productSchema.virtual('discountPercent').get(function discountPercent() {
  if (!this.compareAtPrice || this.compareAtPrice <= this.price) return 0;
  return Math.round(((this.compareAtPrice - this.price) / this.compareAtPrice) * 100);
});

/* ---------- Hooks ---------- */
// Before validation: build a unique slug from the name for NEW products and RENAMED ones.
// (Same idea as categories in branch 03: "Blue Mug" → "blue-mug", or "blue-mug-2" if taken.)
productSchema.pre('validate', async function setSlug() {
  if (this.isNew || this.isModified('name')) {
    this.slug = await uniqueSlug(this.constructor, this.name, this._id);
  }
});

/* ---------- Statics: stock changes (called on the MODEL: Product.reserveStock(...)) ----------
 * Why not "read stock, check it, then save"? Between the read and the save, another request
 * can buy the same item: both see stock 1, both save stock 0 → we sold 2 items we didn't have.
 * Instead, the CONDITION and the CHANGE go to MongoDB in ONE command (updateOne with a filter
 * and $inc). MongoDB runs a single-document update atomically, so the second request simply
 * doesn't match ("stock >= 1" is false now) and gets nothing. */

/**
 * Takes `qty` items out of stock if (and only if) enough are left. Used at checkout (branch 07).
 * @returns {Promise<boolean>} true = reserved, false = not enough stock (or product inactive)
 */
productSchema.statics.reserveStock = async function reserveStock(productId, qty, session) {
  const result = await this.updateOne(
    { _id: productId, isActive: true, stock: { $gte: qty } }, // the condition…
    { $inc: { stock: -qty, sold: qty } }, // …and the change, in one atomic step
    { session }, // part of the checkout transaction (undefined = no transaction)
  );
  return result.modifiedCount === 1;
};

/** Puts items back (an order was cancelled). The reverse of reserveStock. */
productSchema.statics.releaseStock = function releaseStock(productId, qty, session) {
  return this.updateOne({ _id: productId }, { $inc: { stock: qty, sold: -qty } }, { session });
};

/**
 * A MANUAL change by an admin, written to the stock history in the same atomic step.
 * The filter refuses a decrease bigger than the current stock (never below zero).
 * $push with $each + $slice: add the new entry and keep only the LAST 50 entries, so the
 * history can never grow forever.
 * @returns {Promise<Document|null>} the updated product, or null if the stock was too low
 */
productSchema.statics.adjustStock = function adjustStock(productId, change, reason, adminId) {
  return this.findOneAndUpdate(
    // For a decrease of 3 we need stock >= 3; for an increase any stock (>= 0) is fine
    { _id: productId, stock: { $gte: change < 0 ? -change : 0 } },
    {
      $inc: { stock: change },
      $push: {
        stockHistory: {
          $each: [{ change, reason, by: adminId }],
          $slice: -LIMITS.STOCK_HISTORY_KEEP, // negative = keep the last N
        },
      },
    },
    // new: true → return the document AFTER the change; runValidators → check the new entry
    { new: true, runValidators: true },
  );
};

// Clean JSON output (no __v, no duplicate `id`, virtuals included)
productSchema.plugin(toJSON);

// Reuse the model if it already exists (avoids "OverwriteModelError" on hot reload)
export default mongoose.models.Product || mongoose.model('Product', productSchema);
