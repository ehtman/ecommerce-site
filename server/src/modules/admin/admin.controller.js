/**
 * src/modules/admin/admin.controller.js – HTTP layer for /api/admin.
 *
 * Layers: routes → CONTROLLER → service → models. Thin on purpose: read req, call ONE
 * service function, answer. Two answers here are not JSON but CSV FILES, so this file also
 * shows how to send a download (Content-Type + Content-Disposition) and how to STREAM one.
 */
import { once } from 'node:events';
import env from '../../config/env.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/ApiResponse.js';
import { CSV_BOM } from '../../utils/csv.js';
import * as adminService from './admin.service.js';

// Headers that turn a response into a file download named `filename`
function setCsvHeaders(res, filename) {
  // text/csv tells the browser what it is; charset=utf-8 how to read the characters
  res.set('Content-Type', 'text/csv; charset=utf-8');
  // "attachment" = save as a file instead of showing it in the tab
  res.set('Content-Disposition', `attachment; filename="${filename}"`);
  // Reports change every minute and contain business data: never cache them
  res.set('Cache-Control', 'no-store');
}

// GET /api/admin/dashboard/stats?range=30d
export const dashboardStats = asyncHandler(async (req, res) => {
  sendSuccess(res, 200, 'Dashboard stats', await adminService.getDashboardStats(req.query));
});

// GET /api/admin/reports/sales?from&to&groupBy&tz
export const salesReport = asyncHandler(async (req, res) => {
  sendSuccess(res, 200, 'Sales report', await adminService.getSalesReport(req.query));
});

// GET /api/admin/reports/sales/export → a small file, built in memory and sent at once
export const salesReportCsv = asyncHandler(async (req, res) => {
  const { filename, csv } = await adminService.getSalesReportCsv(req.query);
  setCsvHeaders(res, filename);
  res.status(200).send(CSV_BOM + csv);
});

// GET /api/admin/reports/orders/export → a possibly LARGE file, streamed line by line
export const ordersCsv = asyncHandler(async (req, res) => {
  // Throws 400 for bad dates BEFORE any byte is sent (asyncHandler → error handler)
  const { filename, lines } = adminService.prepareOrdersExport(req.query);
  setCsvHeaders(res, filename);
  res.status(200);
  res.write(CSV_BOM);
  try {
    for await (const line of lines) {
      // BACKPRESSURE: write() returns false when the network buffer is full (slow client).
      // We then wait for 'drain' instead of piling the whole file up in memory.
      if (!res.write(line)) await once(res, 'drain');
    }
  } catch (err) {
    // The 200 status is already sent, so a JSON error is impossible now. Cutting the
    // connection is the honest signal: the browser reports a FAILED download instead of
    // saving a silently incomplete file.
    if (!env.isTest) console.error(err);
    res.destroy(err);
    return;
  }
  res.end(); // tell the client the file is complete
});

// GET /api/admin/inventory
export const inventory = asyncHandler(async (_req, res) => {
  sendSuccess(res, 200, 'Inventory overview', await adminService.getInventoryOverview());
});

// GET /api/admin/products/low-stock?threshold=5
export const lowStock = asyncHandler(async (req, res) => {
  sendSuccess(res, 200, 'Low-stock products fetched', await adminService.getLowStock(req.query));
});

// GET /api/admin/users?search&status&page&limit → data + pagination meta
export const listCustomers = asyncHandler(async (req, res) => {
  const { data, meta } = await adminService.listCustomers(req.query);
  sendSuccess(res, 200, 'Customers fetched', data, meta);
});

// GET /api/admin/users/:id
export const getCustomer = asyncHandler(async (req, res) => {
  sendSuccess(res, 200, 'Customer fetched', await adminService.getCustomer(req.params.id));
});

// PATCH /api/admin/users/:id/status   { isActive }
export const setCustomerStatus = asyncHandler(async (req, res) => {
  // req.user._id = the admin doing it (from the verified token), used for the "not yourself" rule
  const user = await adminService.setCustomerStatus(req.user._id, req.params.id, req.body.isActive);
  sendSuccess(res, 200, user.isActive ? 'Customer activated' : 'Customer deactivated', user);
});
