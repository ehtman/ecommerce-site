/**
 * src/modules/reviews/review.controller.js – HTTP layer for reviews.
 *
 * Layers: routes → CONTROLLER → service → model. Thin on purpose: read req, call ONE
 * service function, answer with sendSuccess. Used by TWO route files:
 *   products/product.routes.js → /api/products/:id/reviews…   (here :id = the PRODUCT id)
 *   reviews/review.routes.js   → /api/reviews/:id…            (here :id = the REVIEW id)
 * The author is ALWAYS `req.user` (from the verified token), never an id from the body.
 */
import asyncHandler from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/ApiResponse.js';
import * as reviewService from './review.service.js';

// GET /api/products/:id/reviews (public) → data = page of reviews, meta = pagination info
export const listForProduct = asyncHandler(async (req, res) => {
  const { data, meta } = await reviewService.listForProduct(req.params.id, req.query);
  sendSuccess(res, 200, 'Reviews fetched', data, meta);
});

// GET /api/products/:id/reviews/eligibility → { canReview, reason?, review? }
export const eligibility = asyncHandler(async (req, res) => {
  const result = await reviewService.eligibility(req.user, req.params.id);
  sendSuccess(res, 200, 'Eligibility checked', result);
});

// POST /api/products/:id/reviews → 201 Created
export const create = asyncHandler(async (req, res) => {
  const review = await reviewService.createReview(req.user._id, req.params.id, req.body);
  sendSuccess(res, 201, 'Thank you for your review', review);
});

// PUT /api/reviews/:id (author only)
export const update = asyncHandler(async (req, res) => {
  const review = await reviewService.updateReview(req.user._id, req.params.id, req.body);
  sendSuccess(res, 200, 'Review updated', review);
});

// DELETE /api/reviews/:id (author or admin): the service needs the whole user for the role
export const remove = asyncHandler(async (req, res) => {
  await reviewService.deleteReview(req.user, req.params.id);
  sendSuccess(res, 200, 'Review deleted');
});

// GET /api/reviews/admin (admin moderation list)
export const adminList = asyncHandler(async (req, res) => {
  const { data, meta } = await reviewService.adminList(req.query);
  sendSuccess(res, 200, 'Reviews fetched', data, meta);
});

// PATCH /api/reviews/:id/visibility (admin): the message says what happened
export const setVisibility = asyncHandler(async (req, res) => {
  const review = await reviewService.setVisibility(req.params.id, req.body.isVisible);
  sendSuccess(res, 200, review.isVisible ? 'Review is visible' : 'Review hidden', review);
});
