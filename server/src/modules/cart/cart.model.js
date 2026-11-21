/**
 * src/modules/cart/cart.model.js – the Cart collection: ONE shopping cart per customer.
 *
 * WHAT: One document per user. The lines of the cart ("2 × Blue Mug") live INSIDE the cart
 *       document as an array of small sub-documents (`items`).
 * WHY:  A cart is always read and written as a whole ("show my cart"), it is small (a few
 *       lines) and its lines never exist without the cart. That is the textbook case for
 *       EMBEDDED SUB-DOCUMENTS: one read gets everything, no joins, no extra collection.
 *       (Addresses, by contrast, are a separate collection because orders copy them and
 *       they are edited one by one.) See docs/concepts/18-transactions-and-atomic-updates.md.
 * WHERE: routes → controller → cart.service.js → MODEL → MongoDB.
 *       Also created at registration by auth.service.js (inside a transaction), emptied
 *       after checkout in branch 07, and cleaned when a product is deleted (deleteProduct pulls it).
 *
 * IMPORTANT: the cart stores NO PRICES. Only "which product, how many". Prices are read
 * from the Product collection every time the cart is shown, so a price change (or a
 * client trying to send its own price) can never make the cart total wrong.
 *
 * Business rules (invariants):
 *  - exactly one cart per user                   → `unique: true` on `user`
 *  - quantity is a whole number 1–10 (BR-04)      → min/max/validator below
 *  - each product appears at most once           → array validator below; adding the same
 *    product again INCREASES its quantity (cart.service.js)
 *  - quantity never above stock                  → checked in cart.service.js (stock changes)
 */
import mongoose from 'mongoose';
import toJSON from '../../db/plugins/toJSON.js';
import { LIMITS } from '../../config/constants.js';

const { Schema } = mongoose;

// One LINE of the cart. A sub-schema = the shape of each object inside the `items` array.
const cartItemSchema = new Schema(
  {
    // Which product. `ref` lets cart.service.js `populate()` it into the full product.
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    quantity: {
      type: Number,
      required: true,
      min: [1, 'Quantity must be at least 1'],
      max: [LIMITS.MAX_CART_QTY, `You can buy at most ${LIMITS.MAX_CART_QTY} of one product`],
      // 2.5 mugs makes no sense: only whole numbers
      validate: { validator: Number.isInteger, message: 'Quantity must be a whole number' },
    },
    // When the line was first added (handy for "recently added" sorting in the UI)
    addedAt: { type: Date, default: Date.now },
  },
  // Lines are identified by their `product`, so they do not need their own _id
  { _id: false },
);

const cartSchema = new Schema(
  {
    // The owner. `unique` = MongoDB itself refuses a second cart for the same user.
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    items: {
      type: [cartItemSchema], // an array of embedded sub-documents
      default: [], // a new cart is empty
      validate: {
        // A Set drops duplicates: if its size is smaller, some product appears twice
        validator: (items) => new Set(items.map((i) => String(i.product))).size === items.length,
        message: 'Each product can appear only once in the cart',
      },
    },
  },
  { timestamps: true }, // createdAt / updatedAt (updatedAt = "cart last touched")
);

// A VIRTUAL is a computed field: not stored, calculated when read. Total pieces in the cart.
cartSchema.virtual('itemCount').get(function itemCount() {
  return this.items.reduce((sum, i) => sum + i.quantity, 0);
});

/**
 * Cart.forUser(userId) – "get my cart, and create it if it does not exist yet", in ONE
 * atomic database call. This is an UPSERT (update + insert):
 *   - a cart for this user exists → it is returned unchanged ($setOnInsert does nothing)
 *   - no cart                       → MongoDB inserts one with the $setOnInsert values
 * Why needed when registration already creates a cart? Users created before this branch
 * (e.g. the seeded admin, old customers) have none. Upsert makes that case safe, and two
 * parallel requests cannot create two carts (the unique index on `user` guarantees it).
 * `session` is optional: pass one to run inside a transaction.
 */
cartSchema.statics.forUser = function forUser(userId, session) {
  return this.findOneAndUpdate(
    { user: userId },
    { $setOnInsert: { user: userId, items: [] } },
    { upsert: true, new: true, session }, // new: true → return the document AFTER the upsert
  );
};

cartSchema.plugin(toJSON); // clean JSON (no __v)

// Reuse the model if it already exists (avoids "OverwriteModelError" on hot reload)
export default mongoose.models.Cart || mongoose.model('Cart', cartSchema);
