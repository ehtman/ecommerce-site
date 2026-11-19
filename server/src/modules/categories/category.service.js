/**
 * src/modules/categories/category.service.js – business logic for categories.
 *
 * Layers: routes → controller → SERVICE → model. No req/res here; errors are ApiErrors.
 * Used by: category.controller.js, the product service (branch 04, which checks that a
 * product's category exists) and, from branch 10, the admin module (listAllWithCounts).
 *
 * New idea: PUBLIC vs ADMIN views of the same data. Customers (and visitors who are not
 * logged in) only ever see ACTIVE categories, and an inactive one answers 404 exactly like
 * a missing one. Admins can create, change, switch off and delete categories.
 * See docs/concepts/15-slugs-and-public-vs-admin-apis.md.
 *
 * Branch 04 (products & uploads) added to this file:
 *  - deleteCategory: refused while products still use the category
 *  - the old image is deleted from Cloudinary when an image is replaced or removed
 *  - listAllWithCounts: an admin list with a product count per category
 *    (served at /api/admin/categories, branch 10)
 */
import { Category, Product } from '../models.js';
import { CASE_INSENSITIVE } from './category.model.js';
import ApiError from '../../utils/ApiError.js';
import { deleteImage } from '../../config/cloudinary.js';

// Menu order: the admin's sortOrder first, then alphabetical
const MENU_ORDER = { sortOrder: 1, name: 1 };

// The ONLY fields a client may set. `slug` (built from the name), `_id`, timestamps… are
// never copied from the body (mass assignment protection). `parent` has its own checks.
const FIELDS = ['name', 'description', 'image', 'isActive', 'sortOrder'];
// Copies the allowed fields that were actually sent: pick({ name: 'X', slug: 'y' }) → { name: 'X' }
const pick = (body) =>
  Object.fromEntries(FIELDS.filter((f) => body[f] !== undefined).map((f) => [f, body[f]]));

const notFound = () => new ApiError(404, 'Category not found');

/**
 * Names are unique ignoring case. Checking BEFORE saving gives a clear 409 message.
 * (The unique index is still the real guarantee: if two admins save "Shoes" at the same
 * moment, the second one gets error 11000, which the error handler also turns into 409.)
 */
async function assertNameFree(name, selfId = null) {
  const filter = { name: name.trim(), ...(selfId && { _id: { $ne: selfId } }) };
  // .collation(...) makes this query compare like the index: "SHOES" finds "Shoes"
  const taken = await Category.exists(filter).collation(CASE_INSENSITIVE);
  if (taken) {
    const message = 'A category with this name already exists';
    throw new ApiError(409, message, [{ field: 'name', message }]);
  }
}

/**
 * The two-level rule. Returns the parent id to save (null = top-level), or throws 400.
 *   Men (top)  →  Shoes (child)  ✔
 *   Men → Shoes → Sneakers       ✘ only two levels
 * @param parentId  what the client sent ("" / null / undefined = no parent)
 * @param selfId    the category being UPDATED (undefined when creating)
 */
async function checkParent(parentId, selfId = null) {
  if (!parentId) return null; // no parent → top-level category
  if (selfId && String(parentId) === String(selfId)) {
    throw new ApiError(400, 'A category cannot be its own parent');
  }
  // .lean() = a plain object: we only read one field, no need for a full document
  const parent = await Category.findById(parentId).lean();
  if (!parent) throw new ApiError(400, 'Parent category not found');
  // The parent must itself be top-level, or we would get a third level
  if (parent.parent) throw new ApiError(400, 'Only two category levels are allowed');
  // A category that HAS children cannot become a child (its children would be level 3)
  if (selfId && (await Category.exists({ parent: selfId }))) {
    throw new ApiError(400, 'This category has sub-categories, so it cannot become a sub-category');
  }
  return parentId;
}

/** PUBLIC: every active category, in menu order (a flat list; `parent` links the levels). */
export function listActive() {
  // Full documents (not .lean()), so the toJSON plugin cleans each one (no __v)
  return Category.find({ isActive: true }).sort(MENU_ORDER);
}

/** PUBLIC: one active category by its slug. Inactive and missing look the same: 404. */
export async function getBySlug(slug) {
  // The schema's `lowercase: true` also applies to this query: "Shoes" looks for "shoes"
  const category = await Category.findOne({ slug, isActive: true });
  if (!category) throw notFound();
  return category;
}

/**
 * ADMIN (branch 04): every category, active or not, each with how many products use it.
 * Served at GET /api/admin/categories by the admin module (branch 10).
 * One aggregation counts ALL categories at once ($group = "GROUP BY category"), instead of
 * one countDocuments() per category (that would be N extra queries).
 */
export async function listAllWithCounts() {
  const [categories, counts] = await Promise.all([
    Category.find().sort(MENU_ORDER).populate('parent', 'name slug').lean(),
    Product.aggregate([{ $group: { _id: '$category', count: { $sum: 1 } } }]),
  ]);
  // { "<categoryId>": 3, … } for quick lookups
  const byId = Object.fromEntries(counts.map((c) => [String(c._id), c.count]));
  return categories.map((c) => ({ ...c, productCount: byId[String(c._id)] || 0 }));
}

/** ADMIN: create a category. The slug is generated by the model hook. */
export async function createCategory(body) {
  await assertNameFree(body.name);
  const parent = await checkParent(body.parent);
  return Category.create({ ...pick(body), parent });
}

/** ADMIN: change any subset of fields. Renaming also renames the slug. */
export async function updateCategory(id, body) {
  const category = await Category.findById(id);
  if (!category) throw notFound();
  // Remember the old picture, so it can be deleted from Cloudinary once replaced/removed
  const oldImage = category.image?.publicId;

  if (body.name !== undefined) await assertNameFree(body.name, id);
  Object.assign(category, pick(body)); // only the allowed fields
  // `parent` was sent (even as null/"") → re-check the two-level rule. Not sent → keep it.
  if (body.parent !== undefined) category.parent = await checkParent(body.parent, id);
  // image: null means "remove the picture" → undefined deletes the field
  if (body.image === null) category.image = undefined;

  await category.save(); // runs the slug hook (if the name changed) and every validator
  // Replaced or removed → delete the old file (only after the save worked; never throws)
  if (oldImage && oldImage !== category.image?.publicId) await deleteImage(oldImage);
  return category;
}

/** ADMIN: delete a category. Refused while products use it or it still has sub-categories. */
export async function deleteCategory(id) {
  const category = await Category.findById(id);
  if (!category) throw notFound();

  // A category that products still use cannot be deleted (they would point at nothing).
  // The admin should switch it off (isActive: false) or move the products first.
  const products = await Product.countDocuments({ category: id });
  if (products) {
    throw new ApiError(
      400,
      `Cannot delete: ${products} product(s) use this category. Deactivate it instead.`,
    );
  }
  const children = await Category.countDocuments({ parent: id });
  if (children) {
    // Deleting it would leave its children pointing at nothing ("orphans")
    const noun = children === 1 ? 'sub-category' : 'sub-categories';
    throw new ApiError(400, `Cannot delete: it has ${children} ${noun}`);
  }

  await category.deleteOne();
  // The picture is not needed any more (deleteImage never throws)
  if (category.image?.publicId) await deleteImage(category.image.publicId);
}
