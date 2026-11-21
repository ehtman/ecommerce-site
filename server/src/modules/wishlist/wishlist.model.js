/**
 * src/modules/wishlist/wishlist.model.js – the Wishlist collection: ONE list of saved
 * ("maybe later") products per customer.
 *
 * WHAT: One document per user with an array of product ids.
 * WHY:  Like the cart, a wishlist is small and always read as a whole, so the product ids
 *       are EMBEDDED in one document instead of one document per saved product.
 *       Unlike the cart there is no quantity: a product is either in the list or not.
 * WHERE: routes → controller → wishlist.service.js → MODEL → MongoDB.
 *       Also created at registration by auth.service.js (inside a transaction) and cleaned
 *       when a product is deleted (deleteProduct pulls it).
 *
 * Business rules (invariants):
 *  - exactly one wishlist per user                → `unique: true` on `user`
 *  - no duplicates                                → `$addToSet` in addProduct() below
 *  - at most LIMITS.MAX_WISHLIST (100) products   → the atomic filter in addProduct() and
 *    the array validator (second safety net for code that uses .save())
 */
import mongoose from 'mongoose';
import toJSON from '../../db/plugins/toJSON.js';
import { LIMITS } from '../../config/constants.js';

const { Schema } = mongoose;

const wishlistSchema = new Schema(
  {
    // The owner. `unique` = MongoDB itself refuses a second wishlist for the same user.
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    products: {
      type: [{ type: Schema.Types.ObjectId, ref: 'Product' }], // an array of ids
      default: [],
      validate: {
        validator: (ids) => ids.length <= LIMITS.MAX_WISHLIST,
        message: `Wishlist can hold at most ${LIMITS.MAX_WISHLIST} products`,
      },
    },
  },
  { timestamps: true },
);

/** "Get my wishlist, create it if missing" in one atomic UPSERT (see Cart.forUser). */
wishlistSchema.statics.forUser = function forUser(userId, session) {
  return this.findOneAndUpdate(
    { user: userId },
    { $setOnInsert: { user: userId, products: [] } },
    { upsert: true, new: true, session },
  );
};

/**
 * Adds a product ATOMICALLY, without duplicates and without passing the limit.
 *
 * `$addToSet` = "push this value only if it is not in the array yet". Calling it twice has
 * the same result as calling it once: the operation is IDEMPOTENT (safe to repeat, e.g.
 * when a user double-clicks the heart icon or the network retries the request).
 *
 * The filter `products.<MAX-1>: { $exists: false }` means "the array has NO element at
 * position 99", i.e. it has fewer than 100 items. Filter + update run as ONE operation
 * inside MongoDB, so two parallel requests can never push the list to 101.
 * Returns true when the list was matched (product added or already there), false when full.
 */
wishlistSchema.statics.addProduct = async function addProduct(userId, productId) {
  const result = await this.updateOne(
    { user: userId, [`products.${LIMITS.MAX_WISHLIST - 1}`]: { $exists: false } },
    { $addToSet: { products: productId } },
  );
  return result.matchedCount === 1;
};

/** Removes a product. `$pull` removes every matching value; removing a missing one is a no-op. */
wishlistSchema.statics.removeProduct = function removeProduct(userId, productId) {
  return this.updateOne({ user: userId }, { $pull: { products: productId } });
};

wishlistSchema.plugin(toJSON); // clean JSON (no __v)

// Reuse the model if it already exists (avoids "OverwriteModelError" on hot reload)
export default mongoose.models.Wishlist || mongoose.model('Wishlist', wishlistSchema);
