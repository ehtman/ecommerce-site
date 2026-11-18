/**
 * src/modules/addresses/address.controller.js – HTTP layer for /api/addresses.
 *
 * Layers: routes → CONTROLLER → service → model. Thin on purpose: read req, call ONE
 * service function, answer with sendSuccess. The owner is ALWAYS `req.user._id` (from the
 * verified token), never an id from the body or the URL.
 */
import asyncHandler from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/ApiResponse.js';
import * as addressService from './address.service.js';

// GET /api/addresses
export const list = asyncHandler(async (req, res) => {
  const addresses = await addressService.listAddresses(req.user._id);
  sendSuccess(res, 200, 'Addresses fetched', addresses);
});

// POST /api/addresses → 201 Created
export const create = asyncHandler(async (req, res) => {
  const address = await addressService.createAddress(req.user._id, req.body);
  sendSuccess(res, 201, 'Address added', address);
});

// PUT /api/addresses/:id
export const update = asyncHandler(async (req, res) => {
  const address = await addressService.updateAddress(req.user._id, req.params.id, req.body);
  sendSuccess(res, 200, 'Address updated', address);
});

// DELETE /api/addresses/:id
export const remove = asyncHandler(async (req, res) => {
  await addressService.deleteAddress(req.user._id, req.params.id);
  sendSuccess(res, 200, 'Address deleted');
});

// PATCH /api/addresses/:id/default → returns the whole updated list
export const setDefault = asyncHandler(async (req, res) => {
  const addresses = await addressService.setDefault(req.user._id, req.params.id);
  sendSuccess(res, 200, 'Default address updated', addresses);
});
