/**
 * src/modules/products/product.controller.js – HTTP layer for /api/products.
 *
 * Layers: routes → CONTROLLER → service → model. Thin on purpose: read req, call ONE service
 * function, answer with sendSuccess. List answers also carry `meta` (pagination info):
 *   { success, message, data: [...], meta: { page, limit, total, pages } }
 */
import asyncHandler from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/ApiResponse.js';
import * as productService from './product.service.js';

/* ---------- Public ---------- */

// GET /api/products?keyword&category&minPrice&maxPrice&rating&inStock&isFeatured&brand&sort&page&limit
export const list = asyncHandler(async (req, res) => {
  const { data, meta } = await productService.listProducts(req.query);
  sendSuccess(res, 200, 'Products fetched', data, meta);
});

// GET /api/products/:slug
export const getBySlug = asyncHandler(async (req, res) => {
  const product = await productService.getProductBySlug(req.params.slug);
  sendSuccess(res, 200, 'Product fetched', product);
});

// GET /api/products/brands
export const brands = asyncHandler(async (_req, res) => {
  sendSuccess(res, 200, 'Brands fetched', await productService.listBrands());
});

/* ---------- Admin ---------- */
// The next three are mounted by the admin module (branch 10) at /api/admin/products…,
// exactly like the reference app. They live here because they are about products.

// GET /api/admin/products (branch 10)
export const adminList = asyncHandler(async (req, res) => {
  const { data, meta } = await productService.adminListProducts(req.query);
  sendSuccess(res, 200, 'Products fetched', data, meta);
});

// GET /api/admin/products/low-stock (branch 10)
export const lowStock = asyncHandler(async (_req, res) => {
  sendSuccess(res, 200, 'Low-stock products fetched', await productService.lowStock());
});

// GET /api/admin/products/:id (branch 10)
export const adminGet = asyncHandler(async (req, res) => {
  sendSuccess(res, 200, 'Product fetched', await productService.adminGetProduct(req.params.id));
});

// POST /api/products → 201. The creator is the logged-in admin (from the token).
export const create = asyncHandler(async (req, res) => {
  const product = await productService.createProduct(req.user._id, req.body);
  sendSuccess(res, 201, 'Product created', product);
});

// PUT /api/products/:id
export const update = asyncHandler(async (req, res) => {
  const product = await productService.updateProduct(req.params.id, req.body);
  sendSuccess(res, 200, 'Product updated', product);
});

// DELETE /api/products/:id
export const remove = asyncHandler(async (req, res) => {
  const { softDeleted } = await productService.deleteProduct(req.params.id);
  const message = softDeleted
    ? 'Product is used in orders, so it was deactivated instead of deleted'
    : 'Product deleted';
  sendSuccess(res, 200, message, { softDeleted });
});

// DELETE /api/products/:id/images/:imageId
export const removeImage = asyncHandler(async (req, res) => {
  const product = await productService.removeImage(req.params.id, req.params.imageId);
  sendSuccess(res, 200, 'Image removed', product);
});

// PATCH /api/products/:id/stock
export const updateStock = asyncHandler(async (req, res) => {
  const result = await productService.updateStock(req.user._id, req.params.id, req.body);
  sendSuccess(res, 200, 'Stock updated', result);
});
