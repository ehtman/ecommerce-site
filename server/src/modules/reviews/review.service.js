/**
 * src/modules/reviews/review.service.js – business logic for product reviews.
 *
 * Layers: routes → controller → SERVICE → model. No req/res here; errors are ApiErrors.
 * Used by: review.controller.js (public list, customer create/edit/delete, admin moderation).
 *
 * The business rules (invariants) this file protects:
 *  BR-07a  only a customer whose order containing the product is DELIVERED may review it
 *          ("verified buyer"). Paid-but-not-delivered is not enough: you cannot judge a
 *          mug you have not held yet.
 *  BR-07b  ONE review per product per customer → friendly 409 here, unique index as backup
 *  BR-07c  only the AUTHOR may edit a review; the author or an admin may delete it.
 *          Someone else's review id simply "does not exist" for you → 404 (no IDOR leak).
 *  BR-07d  hidden (moderated) reviews are invisible to the public and do not count in the
 *          product's average.
 * After every change the model's hooks recalculate Product.ratingAverage / ratingCount.
 */
import { Review, Order, Product } from '../models.js';
import ApiError from '../../utils/ApiError.js';
import { getPagination, buildMeta } from '../../utils/pagination.js';
import { ORDER_STATUS, ROLES, REVIEW } from '../../config/constants.js';

// Newest first; `_id` breaks ties between reviews saved in the same millisecond
const NEWEST_FIRST = { createdAt: -1, _id: -1 };

// One message for "does not exist" AND "not yours" (same idea as addresses, branch 02)
const notFound = () => new ApiError(404, 'Review not found');

/** Throws 404 when the product id points to nothing. */
async function assertProductExists(productId) {
  // exists() returns { _id } or null; it never loads the whole product (cheap check)
  if (!(await Product.exists({ _id: productId }))) throw new ApiError(404, 'Product not found');
}

/**
 * BR-07a: finds one DELIVERED order of this customer that contains the product.
 * 'items.product' searches INSIDE the order's items array: MongoDB matches the order if ANY
 * item has this product id. (The order model has an index on exactly these fields.)
 */
function findDeliveredOrder(userId, productId) {
  return Order.findOne({
    user: userId, // the customer's OWN orders only
    status: ORDER_STATUS.DELIVERED, // pending/shipped/cancelled orders do not count
    'items.product': productId,
  }).select('_id'); // we only need the id (to store on the review as proof)
}

/* ---------- Public ---------- */

/** GET /api/products/:id/reviews – visible reviews of one product, newest first, paginated. */
export async function listForProduct(productId, query) {
  await assertProductExists(productId);
  // ?page=2&limit=5 → skip the first 5. Limits are capped so nobody asks for 1,000,000 rows.
  const { page, limit, skip } = getPagination(query, REVIEW.PAGE_SIZE, REVIEW.MAX_PAGE_SIZE);
  const filter = { product: productId, isVisible: true }; // BR-07d: hidden ones stay hidden
  // Two independent queries at the same time: the page of reviews AND the total count
  const [reviews, total] = await Promise.all([
    Review.find(filter)
      .sort(NEWEST_FIRST)
      .skip(skip)
      .limit(limit)
      // populate = replace the user id with the user's NAME. Never the email: reviews are
      // public, and a reviewer's email address is private data.
      .populate('user', 'name')
      .lean(), // plain objects: faster, and we do not need document methods here
    Review.countDocuments(filter),
  ]);
  return { data: reviews, meta: buildMeta(page, limit, total) };
}

/* ---------- Customer ---------- */

/**
 * GET /api/products/:id/reviews/eligibility – lets the product page decide whether to
 * show the "Write a review" form, and if not, WHY. It never throws for "not allowed":
 * it answers { canReview: false, reason } so the UI can explain it nicely.
 */
export async function eligibility(user, productId) {
  await assertProductExists(productId);
  // Admins run the shop; they do not review its products (BR-07a: customers only)
  if (user.role !== ROLES.CUSTOMER)
    return { canReview: false, reason: 'Only customers can review' };
  const [order, review] = await Promise.all([
    findDeliveredOrder(user._id, productId),
    Review.findOne({ user: user._id, product: productId }).lean(),
  ]);
  // Already reviewed → send the review back so the UI can offer "Edit your review"
  if (review) return { canReview: false, reason: 'You already reviewed this product', review };
  if (!order) {
    return { canReview: false, reason: 'You can review this product after it is delivered to you' };
  }
  return { canReview: true };
}

/** POST /api/products/:id/reviews – BR-07a + BR-07b, then save (the hook updates the rating). */
export async function createReview(userId, productId, { rating, title, comment }) {
  await assertProductExists(productId); // 404 before 403: a missing product is the bigger news
  const order = await findDeliveredOrder(userId, productId);
  // 403 = "we know who you are, but you have not earned this yet"
  if (!order) throw new ApiError(403, 'You can only review products from your delivered orders');
  // Friendly early check for BR-07b (the common case: the customer clicked "submit" twice)
  if (await Review.exists({ user: userId, product: productId })) {
    throw new ApiError(409, 'You already reviewed this product');
  }
  try {
    // Every owner/link field comes from the server (token, URL, database), never the body
    return await Review.create({
      user: userId,
      product: productId,
      order: order._id, // the proof of purchase
      rating,
      title,
      comment,
    });
  } catch (err) {
    // RACE: two requests passed the check above at the same moment. The unique index let
    // only one of them in; the loser gets error 11000, which we turn into the same 409.
    if (err.code === 11000) throw new ApiError(409, 'You already reviewed this product');
    throw err; // anything else is a real bug → error middleware → 500
  }
}

/** PUT /api/reviews/:id – BR-07c: only the author, and only these three fields. */
export async function updateReview(userId, id, { rating, title, comment }) {
  // An empty title means "remove the headline": $unset deletes the field from the document
  const update = title ? { rating, title, comment } : { rating, comment, $unset: { title: 1 } };
  const review = await Review.findOneAndUpdate(
    { _id: id, user: userId }, // `user` in the filter IS the ownership check
    update,
    // new: true → return the review AFTER the change; runValidators → model rules apply
    // to updates too (by default Mongoose only validates on save()).
    { new: true, runValidators: true },
  );
  if (!review) throw notFound(); // missing OR someone else's → the same 404
  return review; // the findOneAndUpdate hook has already recalculated the product rating
}

/** DELETE /api/reviews/:id – BR-07c: the author deletes their own; an admin may delete any. */
export async function deleteReview(user, id) {
  // Admins moderate, so their filter has no owner condition. Everyone else: own reviews only.
  const filter = user.role === ROLES.ADMIN ? { _id: id } : { _id: id, user: user._id };
  const review = await Review.findOneAndDelete(filter); // the hook recalculates the rating
  if (!review) throw notFound();
}

/* ---------- Admin moderation ---------- */

/**
 * GET /api/reviews/admin – every review (visible AND hidden) with optional filters:
 *   ?rating=1 (find angry reviews first) ?visibility=hidden ?product=<id>
 * The query values were already checked and converted by adminListRules.
 */
export async function adminList(query) {
  const { page, limit, skip } = getPagination(
    query,
    REVIEW.ADMIN_PAGE_SIZE,
    REVIEW.ADMIN_MAX_PAGE_SIZE,
  );
  // A WHITELIST filter: only the keys we choose, never `query` itself (NoSQL injection)
  const filter = {};
  if (query.rating) filter.rating = query.rating;
  if (query.visibility) filter.isVisible = query.visibility === 'visible';
  if (query.product) filter.product = query.product;

  const [reviews, total] = await Promise.all([
    Review.find(filter)
      .sort(NEWEST_FIRST)
      .skip(skip)
      .limit(limit)
      // Admins may see the reviewer's email (to contact them) and which product it was
      .populate('user', 'name email')
      .populate('product', 'name slug')
      .lean(),
    Review.countDocuments(filter),
  ]);
  return { data: reviews, meta: buildMeta(page, limit, total) };
}

/**
 * PATCH /api/reviews/:id/visibility – MODERATION: hide or show a review.
 * Hiding is softer than deleting: the customer's words are kept (the decision can be
 * undone), but the public no longer sees them and the average no longer counts them.
 */
export async function setVisibility(id, isVisible) {
  const review = await Review.findOneAndUpdate({ _id: id }, { isVisible }, { new: true });
  if (!review) throw notFound();
  return review; // the findOneAndUpdate hook has already recalculated the product rating
}
