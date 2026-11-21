/**
 * src/modules/wishlist/wishlist.service.js – business logic of the wishlist.
 *
 * Layers: routes → controller → SERVICE → model. No req/res here; errors are ApiErrors.
 * Used by: wishlist.controller.js.
 *
 * The interesting idea here is the IDEMPOTENT ADD: pressing the heart icon twice (or the
 * browser retrying the request) leaves the wishlist exactly as pressing it once would.
 * `$addToSet` in the model does that inside MongoDB, so there is never a duplicate.
 */
import { Wishlist, Product } from '../models.js';
import ApiError from '../../utils/ApiError.js';
import { LIMITS } from '../../config/constants.js';

// The fields a product card needs (same idea as the product list page)
const CARD_FIELDS =
  'name slug brand price compareAtPrice images stock ratingAverage ratingCount isActive';

/**
 * MY wishlist with the product cards filled in. Returns { productIds, items }:
 *   productIds → lets the UI quickly colour every heart icon on a product grid
 *   items      → the full cards for the wishlist page
 * Inactive products stay saved (they may come back) but are hidden from the result.
 */
export async function getWishlist(userId) {
  const wishlist = await Wishlist.forUser(userId).populate({
    path: 'products',
    select: CARD_FIELDS,
    match: { isActive: true }, // switched-off products are left out of the populated list
  });
  // filter(Boolean) also drops products that were deleted from the database
  const items = wishlist.products.filter(Boolean);
  return { productIds: items.map((p) => p._id), items };
}

/** Save a product to MY wishlist. Already saved → nothing changes (idempotent). */
export async function addProduct(userId, productId) {
  // Hidden or unknown products cannot be saved
  if (!(await Product.exists({ _id: productId, isActive: true }))) {
    throw new ApiError(404, 'Product not found');
  }
  const wishlist = await Wishlist.forUser(userId); // creates the list for older accounts
  // Already in the list → done. (Checked first, so a FULL list still accepts a repeat.)
  if (wishlist.products.some((id) => String(id) === String(productId))) {
    return getWishlist(userId);
  }
  // Atomic "add if not full": false means the list already holds MAX_WISHLIST products
  const added = await Wishlist.addProduct(userId, productId);
  if (!added) {
    throw new ApiError(400, `Your wishlist can hold at most ${LIMITS.MAX_WISHLIST} products`);
  }
  return getWishlist(userId);
}

/** Remove a product from MY wishlist. Not in the list → still OK (idempotent). */
export async function removeProduct(userId, productId) {
  await Wishlist.removeProduct(userId, productId);
  return getWishlist(userId);
}
