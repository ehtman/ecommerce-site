/**
 * src/modules/wishlist/wishlist.controller.js – HTTP layer for /api/wishlist.
 *
 * Layers: routes → CONTROLLER → service → model. Thin: read req, call ONE service
 * function, answer with sendSuccess. The owner is ALWAYS `req.user._id` (from the token).
 * Every route answers with the whole wishlist ({ productIds, items }).
 */
import asyncHandler from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/ApiResponse.js';
import * as wishlistService from './wishlist.service.js';

// GET /api/wishlist
export const getWishlist = asyncHandler(async (req, res) => {
  const wishlist = await wishlistService.getWishlist(req.user._id);
  sendSuccess(res, 200, 'Wishlist fetched', wishlist);
});

// POST /api/wishlist/:productId – 200 (not 201): adding twice gives the same result
export const addProduct = asyncHandler(async (req, res) => {
  const wishlist = await wishlistService.addProduct(req.user._id, req.params.productId);
  sendSuccess(res, 200, 'Added to wishlist', wishlist);
});

// DELETE /api/wishlist/:productId
export const removeProduct = asyncHandler(async (req, res) => {
  const wishlist = await wishlistService.removeProduct(req.user._id, req.params.productId);
  sendSuccess(res, 200, 'Removed from wishlist', wishlist);
});
