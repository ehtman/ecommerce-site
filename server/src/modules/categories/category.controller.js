/**
 * src/modules/categories/category.controller.js – HTTP layer for /api/categories.
 *
 * Layers: routes → CONTROLLER → service → model. Thin on purpose: read req, call ONE
 * service function, answer with sendSuccess. Who may call what is decided in the routes.
 */
import asyncHandler from '../../utils/asyncHandler.js';
import { sendSuccess } from '../../utils/ApiResponse.js';
import * as categoryService from './category.service.js';

// GET /api/categories (public)
export const list = asyncHandler(async (_req, res) => {
  const categories = await categoryService.listActive();
  sendSuccess(res, 200, 'Categories fetched', categories);
});

// GET /api/categories/:slug (public)
export const getBySlug = asyncHandler(async (req, res) => {
  const category = await categoryService.getBySlug(req.params.slug);
  sendSuccess(res, 200, 'Category fetched', category);
});

// GET /api/admin/categories (admin, mounted by the admin module): every category, active
// or not, with its productCount
export const adminList = asyncHandler(async (_req, res) => {
  sendSuccess(res, 200, 'Categories fetched', await categoryService.listAllWithCounts());
});

// POST /api/categories (admin) → 201 Created
export const create = asyncHandler(async (req, res) => {
  const category = await categoryService.createCategory(req.body);
  sendSuccess(res, 201, 'Category created', category);
});

// PUT /api/categories/:id (admin)
export const update = asyncHandler(async (req, res) => {
  const category = await categoryService.updateCategory(req.params.id, req.body);
  sendSuccess(res, 200, 'Category updated', category);
});

// DELETE /api/categories/:id (admin)
export const remove = asyncHandler(async (req, res) => {
  await categoryService.deleteCategory(req.params.id);
  sendSuccess(res, 200, 'Category deleted');
});
