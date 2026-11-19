/**
 * src/modules/products/product.query.js – turns the shop's URL query into a SAFE MongoDB
 * filter and sort for the public product list.
 *
 *   GET /api/products?keyword=shirt&category=men&minPrice=500&maxPrice=3000
 *                    &rating=4&inStock=true&brand=Khaadi&sort=price_asc&page=2
 *
 * WHY A WHITELIST? `req.query` is typed by strangers. Passing it straight to MongoDB
 * (Product.find(req.query)) would let anyone filter on ANY field, including hidden ones
 * (?isActive=false shows switched-off products) or send operators. So we read ONLY the
 * parameters we know, convert each to the right type, and ignore everything else.
 *
 * FILTERING vs SORTING: filtering decides WHICH products are in the list (WHERE price <= 3000);
 * sorting decides their ORDER (cheapest first). Pagination (utils/pagination.js) then cuts
 * the sorted list into pages. See docs/concepts/16-catalog-queries.md.
 *
 * Pure functions (no database), so they are easy to unit test.
 * USED BY: product.service.js → listProducts().
 */

/**
 * The only sort orders a client may ask for (?sort=…). Unknown values → newest.
 * Every sort ends with `_id` as a TIE-BREAKER: without it, two products with the same price
 * may swap places between page 1 and page 2, so one could appear twice and another never.
 */
export const SORTS = Object.freeze({
  newest: { createdAt: -1, _id: -1 },
  price_asc: { price: 1, _id: 1 },
  price_desc: { price: -1, _id: -1 },
  rating: { ratingAverage: -1, ratingCount: -1, _id: -1 },
  popular: { sold: -1, _id: -1 },
});

// The longest search text we pass on (long texts make text search slow for nothing)
const MAX_KEYWORD_LENGTH = 100;

/**
 * Escapes every character that has a special meaning in a regular expression, so the user's
 * text is matched LITERALLY: "a.b" must not match "axb". Without this, a crafted pattern such
 * as "(a+)+$" could make the regex engine work for minutes (a "ReDoS" attack).
 */
export const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// "1500" → 1500. Anything that is not a number ≥ 0 ("abc", "-5", "") → null = "not sent".
const toNumber = (value) => {
  // Only plain strings/numbers: ?minPrice[]=1 arrives as an array and is ignored
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  if (value === '') return null; // Number('') would be 0, but "" means "not sent"
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

// A non-empty, trimmed string, or null (query values can also be arrays or objects)
const toText = (value) => (typeof value === 'string' && value.trim() ? value.trim() : null);

/**
 * Builds the MongoDB filter for the PUBLIC list.
 * @param {object} query        usually req.query
 * @param {Array|null} categoryIds  the ids of the category from ?category=<slug> and its
 *                                  sub-categories (looked up by the service), or null = any
 * @returns {object} a filter such as { isActive: true, price: { $gte: 500 } }
 */
export function buildProductFilter(query, categoryIds = null) {
  // ALWAYS: the public never sees switched-off products. Nothing in the query can change this.
  const filter = { isActive: true };

  // Keyword search uses the TEXT index (product.model.js): it matches whole words in the
  // name, brand and description, ranked by the index weights.
  const keyword = toText(query.keyword);
  if (keyword) filter.$text = { $search: keyword.slice(0, MAX_KEYWORD_LENGTH) };

  // $in = "category is one of these ids" (the category itself + its children)
  if (categoryIds) filter.category = { $in: categoryIds };

  // Price range: $gte = "greater than or equal", $lte = "less than or equal"
  const min = toNumber(query.minPrice);
  const max = toNumber(query.maxPrice);
  if (min !== null || max !== null) {
    filter.price = {};
    if (min !== null) filter.price.$gte = min;
    if (max !== null) filter.price.$lte = max;
  }

  // "4 stars & up". 0 means "any rating", so it adds no filter. Capped at 5.
  const rating = toNumber(query.rating);
  if (rating) filter.ratingAverage = { $gte: Math.min(rating, 5) };

  // Checkbox-style flags: only the exact text "true" switches them on
  if (query.inStock === 'true') filter.stock = { $gt: 0 };
  if (query.isFeatured === 'true') filter.isFeatured = true;

  // Brand must match EXACTLY but ignoring case ("khaadi" finds "Khaadi"): ^…$ anchors the
  // whole value and the 'i' flag ignores case. The text is escaped (see escapeRegex).
  const brand = toText(query.brand);
  if (brand) filter.brand = new RegExp(`^${escapeRegex(brand)}$`, 'i');

  return filter;
}

/** ?sort=price_asc → { price: 1, _id: 1 }. Unknown or missing → newest first. */
export function getSort(sort) {
  // Object.hasOwn: "toString" or "__proto__" are not our sorts, even though every object has them
  return Object.hasOwn(SORTS, sort) ? SORTS[sort] : SORTS.newest;
}
