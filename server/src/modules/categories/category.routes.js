/**
 * src/modules/categories/category.routes.js – the URL map of the categories module.
 * Mounted in app.js under /api/categories.
 *
 * This is the first module with BOTH kinds of routes on one URL:
 *   PUBLIC (no token): GET /            GET /:slug        → anyone can browse the shop
 *   ADMIN only:        POST /           PUT /:id          DELETE /:id
 *     pipeline: protect (who are you?) → authorize('admin') → validateObjectId → validate → controller
 *
 * Reading uses the readable SLUG (/api/categories/mens-shoes); changing uses the stable
 * ID (/api/categories/665f…), because a rename changes the slug but never the id.
 * See docs/concepts/15-slugs-and-public-vs-admin-apis.md.
 */
import { Router } from 'express';
import { protect, authorize } from '../../middleware/auth.middleware.js';
import { validate, validateObjectId } from '../../middleware/validate.middleware.js';
import { ROLES } from '../../config/constants.js';
import * as c from './category.controller.js';
import { createCategoryRules, updateCategoryRules } from './category.validation.js';

const router = Router();

// The two guards every admin route needs, kept in one array and spread with `...`
const adminOnly = [protect, authorize(ROLES.ADMIN)];

// ---------- Public ----------
router.get('/', c.list);
router.get('/:slug', c.getBySlug);

// ---------- Admin ----------
router.post('/', ...adminOnly, validate(createCategoryRules), c.create);
router.put('/:id', ...adminOnly, validateObjectId('id'), validate(updateCategoryRules), c.update);
router.delete('/:id', ...adminOnly, validateObjectId('id'), c.remove);

export default router;
