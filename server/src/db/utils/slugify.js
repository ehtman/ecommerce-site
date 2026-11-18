/**
 * src/db/utils/slugify.js – turns a name into a URL-friendly "slug", and finds a free one.
 *
 * WHAT: A slug is the readable part of a URL: "Men's Shoes" → "mens-shoes", so the shop can
 *       use /category/mens-shoes instead of /category/665f1c2e9b1e8a0012345678.
 * WHY:  Readable URLs are easier to share, look trustworthy and help search engines (SEO).
 *       A slug is used to FIND a document, so it must be unique in its collection.
 * WHERE: Called by model hooks (category.model.js now, product.model.js in branch 04) before
 *       a document is saved. It lives in db/ because more than one module needs it.
 * See docs/concepts/15-slugs-and-public-vs-admin-apis.md.
 */

/**
 * slugify('Men’s Shoes & Bags!') → 'mens-shoes-bags'
 * Pure function: same input, same output, no database. Easy to unit test.
 */
export default function slugify(text) {
  return (
    String(text) // accept numbers too, never crash on non-strings
      // NFKD splits "é" into "e" + a separate accent mark…
      .normalize('NFKD')
      // …so this line can delete the accent marks: "Café" → "Cafe"
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .trim()
      // Remove every character that is not a letter, digit, space, "_" or "-"
      // ("men's" → "mens", "a & b" → "a  b")
      .replace(/[^a-z0-9\s_-]/g, '')
      // Any run of spaces, underscores or dashes becomes ONE dash ("a  b" → "a-b")
      .replace(/[\s_-]+/g, '-')
      // No dash at the start or the end ("-shoes-" → "shoes")
      .replace(/^-+|-+$/g, '')
  );
}

/**
 * Finds a slug that no OTHER document in `Model` uses yet:
 *   "blue-mug" → taken? → "blue-mug-2" → taken? → "blue-mug-3" …
 *
 * @param {import('mongoose').Model} Model  the collection to look in (e.g. Category)
 * @param {string} base       the text to slugify (usually the name)
 * @param {*} [excludeId]     the document's own _id, so renaming "Shoes" to "shoes!" does
 *                            not see its OWN current slug as "taken"
 * @returns {Promise<string>}
 *
 * NOTE: two requests at exactly the same moment could both pick "blue-mug-2". The unique
 * index on `slug` is the safety net: the second save fails with 409 instead of a duplicate.
 */
export async function uniqueSlug(Model, base, excludeId = null) {
  // A name made only of symbols or non-Latin letters slugifies to "" → use a fallback word
  const root = slugify(base) || 'item';
  // Ignore the document itself when it is being renamed
  const notMe = excludeId ? { _id: { $ne: excludeId } } : {};
  let slug = root;
  let n = 1;
  // Each check depends on the previous answer, so awaiting inside the loop is intended
  while (await Model.exists({ slug, ...notMe })) {
    n += 1;
    slug = `${root}-${n}`;
  }
  return slug;
}
