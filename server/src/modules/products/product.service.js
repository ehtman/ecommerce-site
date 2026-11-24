/**
 * src/modules/products/product.service.js – business logic for the product catalogue.
 *
 * Layers: routes → controller → SERVICE → model. No req/res here; errors are ApiErrors.
 * Used by: product.controller.js (and later cart/order/review services read products too).
 *
 * Two audiences, two views of the same data (as with categories in branch 03):
 *  - PUBLIC (anyone, no login): only ACTIVE products; an inactive product answers 404 exactly
 *    like a missing one. Lists are paginated, filtered, searched and sorted.
 *  - ADMIN: sees every product (active or not), creates, edits, deletes, and changes stock.
 *
 * See docs/concepts/16-catalog-queries.md (pagination, filters, text search, indexes, stock)
 * and docs/concepts/17-file-uploads-and-cdn.md (images on Cloudinary).
 */
import mongoose from 'mongoose';
import { Product, Category, Cart, Wishlist, Order, Review } from '../models.js';
import ApiError from '../../utils/ApiError.js';
import { getPagination, buildMeta } from '../../utils/pagination.js';
import { deleteImage } from '../../config/cloudinary.js';
import { LIMITS } from '../../config/constants.js';
import { buildProductFilter, getSort, escapeRegex } from './product.query.js';

// A product CARD in a list needs only these fields. Asking MongoDB for fewer fields
// ("projection") means smaller responses and less work. The long description is left out.
const CARD_FIELDS =
  'name slug brand price compareAtPrice images stock ratingAverage ratingCount isFeatured category';
// The admin table shows a few more (SKU, sold, active flag, dates)
const ADMIN_FIELDS =
  'name slug sku price compareAtPrice stock sold images isActive isFeatured category createdAt';

// Page sizes: public lists default to 12 cards (a 3×4 or 4×3 grid), at most 48 per page;
// the admin table defaults to 20 rows, at most 100.
const PUBLIC_PAGE = { size: 12, max: 48 };
const ADMIN_PAGE = { size: 20, max: 100 };

// The ONLY fields a client may set on create/update. `slug` (from the name), `sold`,
// `ratingAverage`, `ratingCount`, `stockHistory` and `createdBy` are never copied from the
// body (mass assignment protection). `stock` is only read on create (see createProduct).
const FIELDS = [
  'name',
  'description',
  'brand',
  'sku',
  'price',
  'compareAtPrice',
  'category',
  'images',
  'specifications',
  'isFeatured',
  'isActive',
];

const notFound = () => new ApiError(404, 'Product not found');

/** Copies the allowed fields that were sent and cleans them up. */
function pickProductFields(body) {
  const data = Object.fromEntries(
    FIELDS.filter((f) => body[f] !== undefined).map((f) => [f, body[f]]),
  );
  // An empty form field ("") or null means "no compare-at price"
  if (data.compareAtPrice === '' || data.compareAtPrice === null) data.compareAtPrice = undefined;
  // Keep only url + publicId of each image (drop any _id or extra keys the client sent)
  if (data.images) data.images = data.images.map(({ url, publicId }) => ({ url, publicId }));
  return data;
}

/** 400 if the category does not exist (it is a field of the body, hence 400 and not 404). */
async function assertCategory(categoryId) {
  if (!(await Category.exists({ _id: categoryId }))) {
    const message = 'Category not found';
    throw new ApiError(400, message, [{ field: 'category', message }]);
  }
}

/**
 * 409 if another product already uses this SKU. A friendly early check; the unique index on
 * `sku` stays the real guarantee (two simultaneous saves → error 11000 → also 409).
 */
async function assertSkuFree(sku, selfId = null) {
  const filter = { sku: String(sku).trim().toUpperCase() };
  if (selfId) filter._id = { $ne: selfId }; // when editing, our own SKU is not a conflict
  if (await Product.exists(filter)) {
    const message = 'A product with this SKU already exists';
    throw new ApiError(409, message, [{ field: 'sku', message }]);
  }
}

/**
 * ?category=<slug> → [the category's id, ...its sub-categories' ids], all ACTIVE.
 * So "Men" also lists products of "Men → Shoes". Unknown/inactive slug → [] → no products.
 */
async function categoryIdsFromSlug(slug) {
  const category = await Category.findOne({ slug, isActive: true }).select('_id').lean();
  if (!category) return [];
  const children = await Category.find({ parent: category._id, isActive: true })
    .select('_id')
    .lean();
  return [category._id, ...children.map((c) => c._id)];
}

/* ====================== PUBLIC ====================== */

/**
 * The shop's product list: filters + search + sort + pagination.
 * @returns {{ data: object[], meta: { page, limit, total, pages } }}
 */
export async function listProducts(query) {
  const { page, limit, skip } = getPagination(query, PUBLIC_PAGE.size, PUBLIC_PAGE.max);
  const categorySlug = typeof query.category === 'string' && query.category.trim();
  const categoryIds = categorySlug ? await categoryIdsFromSlug(categorySlug) : null;
  const filter = buildProductFilter(query, categoryIds);

  // Two queries IN PARALLEL (Promise.all): one page of products + how many match in total.
  // lean() returns plain objects (faster; lists don't need Mongoose document features).
  const [products, total] = await Promise.all([
    Product.find(filter)
      .select(CARD_FIELDS)
      .sort(getSort(query.sort))
      .skip(skip)
      .limit(limit)
      .lean(),
    Product.countDocuments(filter),
  ]);
  return { data: products, meta: buildMeta(page, limit, total) };
}

/** One ACTIVE product by its slug, with its category's name and slug. */
export async function getProductBySlug(slug) {
  // Not lean() here, so the virtuals (inStock, discountPercent) are included in the JSON.
  // populate('category', …) replaces the category id with { _id, name, slug, parent }.
  const product = await Product.findOne({ slug, isActive: true }).populate(
    'category',
    'name slug parent',
  );
  if (!product) throw notFound();
  return product;
}

/** Every brand used by an active product, A→Z (for the shop's brand filter). */
export async function listBrands() {
  // distinct() returns each different value once; empty brands are left out
  const brands = await Product.distinct('brand', { isActive: true, brand: { $nin: [null, ''] } });
  return brands.sort((a, b) => a.localeCompare(b));
}

/* ====================== ADMIN ====================== */

/**
 * The admin table: ALL products (active or not), searchable by name or SKU.
 * Served at GET /api/admin/products by the admin module (branch 10).
 *   ?search=shirt  ?category=<id>  ?status=active|inactive  ?sort=stock  ?page ?limit
 */
export async function adminListProducts(query) {
  const { page, limit, skip } = getPagination(query, ADMIN_PAGE.size, ADMIN_PAGE.max);
  const filter = {};
  if (typeof query.search === 'string' && query.search.trim()) {
    // "contains", ignoring case. Escaped, so the admin's text is matched literally.
    const rx = new RegExp(escapeRegex(query.search.trim()), 'i');
    filter.$or = [{ name: rx }, { sku: rx }];
  }
  // Only a real id is used; anything else is ignored instead of causing an error
  if (mongoose.isObjectIdOrHexString(query.category)) filter.category = query.category;
  if (query.status === 'active') filter.isActive = true;
  if (query.status === 'inactive') filter.isActive = false;

  // sort=stock → lowest stock first (what needs re-ordering?); otherwise newest first
  const sort = query.sort === 'stock' ? { stock: 1, _id: 1 } : { createdAt: -1, _id: -1 };
  const [products, total] = await Promise.all([
    Product.find(filter)
      .select(ADMIN_FIELDS)
      .populate('category', 'name')
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean(),
    Product.countDocuments(filter),
  ]);
  return { data: products, meta: buildMeta(page, limit, total) };
}

/** Active products with stock ≤ LIMITS.LOW_STOCK_THRESHOLD, lowest first (max 100). */
export function lowStock() {
  return Product.find({ isActive: true, stock: { $lte: LIMITS.LOW_STOCK_THRESHOLD } })
    .select('name sku stock images')
    .sort({ stock: 1, _id: 1 })
    .limit(100)
    .lean();
}

/** One product by id for the admin edit page, INCLUDING its stock history. */
export async function adminGetProduct(id) {
  const product = await Product.findById(id)
    .select('+stockHistory') // hidden by default (select: false in the model)
    .populate('category', 'name slug')
    .populate('stockHistory.by', 'name') // show WHO changed the stock
    .lean();
  if (!product) throw notFound();
  return product;
}

/** Create a product. The slug is generated by the model hook; createdBy is the admin. */
export async function createProduct(adminId, body) {
  await assertCategory(body.category);
  await assertSkuFree(body.sku);
  const data = pickProductFields(body);
  // `stock` is allowed only here, as the starting stock (default 0)
  return Product.create({ ...data, stock: body.stock ?? 0, createdBy: adminId });
}

/**
 * Replace a product's fields (the admin form sends the whole product).
 * Renaming creates a new slug, so the old public URL stops working (a trade-off, see docs).
 * Images that were in the product before but not any more are deleted from Cloudinary.
 */
export async function updateProduct(id, body) {
  const product = await Product.findById(id);
  if (!product) throw notFound();
  if (body.category !== undefined) await assertCategory(body.category);
  if (body.sku !== undefined) await assertSkuFree(body.sku, id);

  // Remember the current images, to clean up the removed ones after saving
  const oldImageIds = product.images.map((img) => img.publicId);
  const { compareAtPrice, ...data } = pickProductFields(body);
  Object.assign(product, data); // only the allowed fields
  // Not sent, "" or null → removed (undefined deletes the field on save)
  product.compareAtPrice = compareAtPrice;
  await product.save(); // runs every validator and the slug hook (if the name changed)

  // Delete from Cloudinary only AFTER the save worked: if saving had failed, the old
  // images would still be in use.
  const newIds = new Set(product.images.map((img) => img.publicId));
  await Promise.all(oldImageIds.filter((pid) => !newIds.has(pid)).map(deleteImage));
  return product;
}

/**
 * Delete a product, its images, its reviews, and its lines in every cart and wishlist.
 * BR-10: a product that appears in an order is only HIDDEN (isActive = false), so order
 * history never points at a missing product.
 * @returns {{ softDeleted: boolean }} true = hidden, false = really deleted
 */
export async function deleteProduct(id) {
  const product = await Product.findById(id);
  if (!product) throw notFound();

  // BR-10 (branch 07): used in an order → soft delete. The order keeps its own snapshot,
  // but "view product" links and reports still need the document.
  if (await Order.exists({ 'items.product': id })) {
    product.isActive = false;
    await product.save({ validateModifiedOnly: true });
    return { softDeleted: true };
  }

  await product.deleteOne();
  // Branch 05: nobody's cart or wishlist may keep pointing at a deleted product.
  // updateMany + $pull removes the matching line/id from EVERY cart/wishlist in one query each.
  // Branch 09: its reviews go too (deleteMany skips the rating hooks: the product is gone).
  await Promise.all([
    Cart.updateMany({ 'items.product': id }, { $pull: { items: { product: id } } }),
    Wishlist.updateMany({ products: id }, { $pull: { products: id } }),
    Review.deleteMany({ product: id }),
  ]);
  // Images last: a failure here never undoes the delete (deleteImage never throws)
  await Promise.all(product.images.map((img) => deleteImage(img.publicId)));
  return { softDeleted: false };
}

/** Remove ONE image (by its _id) from a product. A product keeps at least one image. */
export async function removeImage(id, imageId) {
  const product = await Product.findById(id);
  if (!product) throw notFound();
  // .id() finds an item of a sub-document array by its _id (this is why images have ids)
  const image = product.images.id(imageId);
  if (!image) throw new ApiError(404, 'Image not found');
  if (product.images.length <= 1) throw new ApiError(400, 'A product needs at least one image');

  const { publicId } = image;
  image.deleteOne(); // removes it from the array (saved below)
  // validateModifiedOnly: only check what changed (images), not unrelated old data
  await product.save({ validateModifiedOnly: true });
  await deleteImage(publicId);
  return product;
}

/**
 * Manual stock change by an admin, recorded in the stock history.
 *   mode 'adjust': value is the change (+20 / -3)
 *   mode 'set':    value is the new total (turned into a change here)
 * @returns {{ _id, stock }} the new stock
 */
export async function updateStock(adminId, id, { mode, value, reason }) {
  if (mode === 'set' && value < 0) throw new ApiError(400, 'Stock cannot be negative');
  const product = await Product.findById(id).select('stock');
  if (!product) throw notFound();

  // "set to 30" when the stock is 25 → a change of +5 (so history always stores changes)
  const change = mode === 'set' ? value - product.stock : value;
  if (change === 0) throw new ApiError(400, 'Stock is already at this value');

  // Atomic: the "enough stock?" check and the change happen in ONE database command
  const updated = await Product.adjustStock(id, change, reason, adminId);
  if (!updated) throw new ApiError(400, 'Stock cannot go below zero');
  return { _id: updated._id, stock: updated.stock };
}
