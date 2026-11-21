/**
 * src/modules/orders/order.controller.js – HTTP layer for /api/orders and /api/admin/orders.
 *
 * Layers: routes → CONTROLLER → service → model. Thin on purpose: read req, call ONE
 * service function, answer with sendSuccess. The customer is ALWAYS `req.user._id` (from
 * the verified token), never an id from the body.
 */
import asyncHandler from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/ApiResponse.js';
import * as orderService from './order.service.js';

/* ---------- Customer ---------- */

// POST /api/orders → 201 Created
export const placeOrder = asyncHandler(async (req, res) => {
  const order = await orderService.placeOrder(req.user._id, req.body);
  sendSuccess(res, 201, 'Order placed successfully', order);
});

// GET /api/orders/my?page=&limit=&status=
export const getMyOrders = asyncHandler(async (req, res) => {
  const { data, meta } = await orderService.getMyOrders(req.user._id, req.query);
  sendSuccess(res, 200, 'Orders fetched', data, meta); // meta = pagination info
});

// GET /api/orders/:id (the owner or an admin)
export const getOrderById = asyncHandler(async (req, res) => {
  const order = await orderService.getOrderById(req.user, req.params.id);
  sendSuccess(res, 200, 'Order fetched', order);
});

// PATCH /api/orders/:id/cancel
export const cancelOrder = asyncHandler(async (req, res) => {
  const order = await orderService.cancelMyOrder(req.user._id, req.params.id, req.body.reason);
  sendSuccess(res, 200, 'Order cancelled', order);
});

/* ---------- Admin ---------- */

// GET /api/admin/orders?page=&limit=&status=&paymentStatus=&from=&to=&search=
export const adminList = asyncHandler(async (req, res) => {
  const { data, meta } = await orderService.adminListOrders(req.query);
  sendSuccess(res, 200, 'Orders fetched', data, meta);
});

// PATCH /api/admin/orders/:id/status
export const adminUpdateStatus = asyncHandler(async (req, res) => {
  const order = await orderService.adminUpdateStatus(req.user._id, req.params.id, req.body);
  sendSuccess(res, 200, `Order marked as ${order.status}`, order);
});
