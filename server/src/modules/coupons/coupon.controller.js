/**
 * src/modules/coupons/coupon.controller.js – HTTP layer for /api/coupons.
 *
 * Layers: routes → CONTROLLER → service → model. Thin on purpose: read req, call ONE service
 * function, answer with sendSuccess. The customer and the admin always come from `req.user`
 * (the verified token), never from the body.
 */
import asyncHandler from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/ApiResponse.js';
import * as couponService from './coupon.service.js';

// POST /api/coupons/validate (customer) → the discount and new totals for MY cart
export const validateCoupon = asyncHandler(async (req, res) => {
  const preview = await couponService.previewCoupon(req.user._id, req.body.code);
  sendSuccess(res, 200, 'Coupon applied', preview);
});

// GET /api/coupons (admin)
export const list = asyncHandler(async (_req, res) => {
  sendSuccess(res, 200, 'Coupons fetched', await couponService.listCoupons());
});

// GET /api/coupons/:id (admin)
export const getOne = asyncHandler(async (req, res) => {
  sendSuccess(res, 200, 'Coupon fetched', await couponService.getCoupon(req.params.id));
});

// POST /api/coupons (admin) → 201 Created
export const create = asyncHandler(async (req, res) => {
  const coupon = await couponService.createCoupon(req.user._id, req.body);
  sendSuccess(res, 201, 'Coupon created', coupon);
});

// PUT /api/coupons/:id (admin)
export const update = asyncHandler(async (req, res) => {
  const coupon = await couponService.updateCoupon(req.params.id, req.body);
  sendSuccess(res, 200, 'Coupon updated', coupon);
});

// DELETE /api/coupons/:id (admin) → deleted, or only deactivated when already used
export const remove = asyncHandler(async (req, res) => {
  const { deactivated } = await couponService.deleteCoupon(req.params.id);
  const message = deactivated ? 'Coupon was already used, so it was deactivated' : 'Coupon deleted';
  sendSuccess(res, 200, message, { deactivated });
});
