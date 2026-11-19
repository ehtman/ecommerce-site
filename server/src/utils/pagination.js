/**
 * src/utils/pagination.js – reads `?page` and `?limit` safely and builds the `meta` object
 * that every paginated list response carries.
 *
 * WHAT is pagination? A shop may have 10 000 products. Sending all of them in one response
 * would be slow for the server, the network and the phone that has to draw them. Instead the
 * client asks for ONE PAGE at a time: "page 2, 12 per page" = products 13 to 24.
 *   skip  = how many documents to jump over   = (page - 1) × limit
 *   limit = how many documents to return       (capped, so nobody can ask for 1 000 000)
 * The response also says how many there are in total, so the UI can draw "Page 2 of 9".
 * See docs/concepts/16-catalog-queries.md.
 *
 * WHERE: Called by services that return lists (product.service.js now; orders, reviews and
 *        admin lists in later branches). Pure functions: no database, easy to unit test.
 */

/**
 * getPagination({ page: '2', limit: '12' }) → { page: 2, limit: 12, skip: 12 }
 *
 * Query-string values are always TEXT ("2"), may be missing, or may be nonsense ("-5", "abc").
 * Every bad value falls back to a safe default instead of causing an error: a list endpoint
 * should be forgiving.
 *
 * @param {object} query           usually `req.query`
 * @param {number} [defaultLimit]  page size when the client does not send one
 * @param {number} [maxLimit]      the biggest page size anyone may ask for
 */
export function getPagination(query, defaultLimit = 12, maxLimit = 48) {
  // parseInt('abc') is NaN, and NaN || 1 is 1. Math.max keeps page at least 1.
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  // Between 1 and maxLimit. "0" or "abc" → the default; "1000" → maxLimit.
  const limit = Math.min(maxLimit, Math.max(1, parseInt(query.limit, 10) || defaultLimit));
  // Page 1 skips nothing, page 2 skips one page worth of documents, and so on
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

/**
 * buildMeta(2, 12, 30) → { page: 2, limit: 12, total: 30, pages: 3 }
 * `pages` is at least 1, so an empty list still says "page 1 of 1" (never "of 0").
 */
export function buildMeta(page, limit, total) {
  // Math.ceil rounds UP: 30 products / 12 per page = 2.5 → 3 pages
  return { page, limit, total, pages: Math.ceil(total / limit) || 1 };
}
