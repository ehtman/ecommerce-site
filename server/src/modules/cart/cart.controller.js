/**
 * src/modules/cart/cart.controller.js – HTTP layer for /api/cart.
 *
 * Layers: routes → CONTROLLER → service → model. Thin on purpose: read req, call ONE
 * service function, answer with sendSuccess. The owner is ALWAYS `req.user._id` (from the
 * verified token). Every route answers with the WHOLE recalculated cart, so the frontend
 * can redraw the page from one response.
 */
import asyncHandler from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/ApiResponse.js';
import * as cartService from './cart.service.js';

// GET /api/cart
export const getCart = asyncHandler(async (req, res) => {
  const cart = await cartService.getCartWithTotals(req.user._id);
  sendSuccess(res, 200, 'Cart fetched', cart);
});

// POST /api/cart/items  { productId, quantity } – only these two fields are read
export const addItem = asyncHandler(async (req, res) => {
  const cart = await cartService.addItem(req.user._id, req.body.productId, req.body.quantity);
  sendSuccess(res, 200, 'Added to cart', cart);
});

// PUT /api/cart/items/:productId  { quantity }
export const updateItem = asyncHandler(async (req, res) => {
  const cart = await cartService.updateItem(req.user._id, req.params.productId, req.body.quantity);
  sendSuccess(res, 200, 'Cart updated', cart);
});

// DELETE /api/cart/items/:productId
export const removeItem = asyncHandler(async (req, res) => {
  const cart = await cartService.removeItem(req.user._id, req.params.productId);
  sendSuccess(res, 200, 'Item removed', cart);
});

// DELETE /api/cart
export const clearCart = asyncHandler(async (req, res) => {
  const cart = await cartService.clearCart(req.user._id);
  sendSuccess(res, 200, 'Cart cleared', cart);
});
