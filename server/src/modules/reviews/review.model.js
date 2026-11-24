/**
 * src/modules/reviews/review.model.js – the Review collection: one customer's star rating
 * and comment about one product.
 *
 * WHAT: One document per (customer, product) pair. It remembers WHICH delivered order
 *       proved that the customer really bought the product (`order`).
 * WHY:  Honest reviews sell products. Only real buyers may write one (checked in the
 *       service), and each buyer gets ONE voice per product (the unique index below).
 * WHERE: routes → controller → service → MODEL → MongoDB. Used by review.service.js.
 *
 * Two new ideas live in this file (see docs/concepts/23-ratings-aggregation-moderation.md):
 *
 * 1) COMPOUND UNIQUE INDEX { product, user }. "Compound" = built from two fields together.
 *    "Unique" = MongoDB refuses a second document with the same PAIR of values. So Ali may
 *    review many products, and a product may have many reviewers, but Ali can never have
 *    two reviews of the same mug, even if two requests arrive at the same millisecond.
 *
 * 2) A DENORMALIZED COUNTER. The product page shows "★ 4.5 (12 reviews)" on every card.
 *    Calculating that from all reviews on every page view would be slow, so we STORE the
 *    result on the product (`ratingAverage`, `ratingCount`) and recalculate it whenever a
 *    review is created, edited, hidden/shown or deleted. "Denormalized" = the same fact is
 *    stored twice (in the reviews AND on the product) on purpose, to make reads cheap.
 *    The price: we must keep the copy in sync, which the hooks at the bottom do.
 */
import mongoose from 'mongoose';
import toJSON from '../../db/plugins/toJSON.js';
import { REVIEW } from '../../config/constants.js';

const { Schema } = mongoose;

const reviewSchema = new Schema(
  {
    // WHO wrote it. Always set by the service from the token, never from the request body.
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    // WHAT is reviewed. Comes from the URL (/api/products/:id/reviews).
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    // The DELIVERED order that proves the purchase. Kept for audits ("was this a real buyer?").
    order: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
    rating: {
      type: Number,
      required: [true, 'Rating is required'],
      min: [REVIEW.RATING_MIN, `Rating must be ${REVIEW.RATING_MIN}–${REVIEW.RATING_MAX}`],
      max: [REVIEW.RATING_MAX, `Rating must be ${REVIEW.RATING_MIN}–${REVIEW.RATING_MAX}`],
      // 4.5 stars is not allowed: a customer picks whole stars. Averages may have decimals.
      validate: { validator: Number.isInteger, message: 'Rating must be a whole number' },
    },
    // An optional short headline, e.g. "Great value for money"
    title: {
      type: String,
      trim: true,
      maxlength: [REVIEW.TITLE_MAX, `Title must be at most ${REVIEW.TITLE_MAX} characters`],
    },
    comment: {
      type: String,
      required: [true, 'Comment is required'],
      trim: true,
      minlength: [REVIEW.COMMENT_MIN, `Comment must be at least ${REVIEW.COMMENT_MIN} characters`],
      maxlength: [REVIEW.COMMENT_MAX, `Comment must be at most ${REVIEW.COMMENT_MAX} characters`],
    },
    // MODERATION switch. An admin can hide a rude or spam review instead of deleting it:
    // hidden reviews disappear from the product page AND from the average, but the data
    // stays, so the decision can be undone. Only admins can change it (see the routes).
    isVisible: { type: Boolean, default: true },
  },
  { timestamps: true }, // createdAt (shown as "reviewed on…") and updatedAt ("edited")
);

/* ---------- Indexes ---------- */
// BR-07 "one review per product per customer", enforced by the DATABASE. The service also
// checks first (to answer with a friendly 409), but only this index is race-proof.
reviewSchema.index({ product: 1, user: 1 }, { unique: true, name: 'one_review_per_product' });
// The public list: "visible reviews of product X, newest first" uses exactly this index.
reviewSchema.index({ product: 1, isVisible: 1, createdAt: -1 });
// The admin moderation list filters by visibility and stars, newest first.
reviewSchema.index({ isVisible: 1, rating: 1, createdAt: -1 });

/* ---------- Statics (called on the MODEL: Review.calcProductRating(id)) ---------- */
/**
 * Recalculates the product's ratingAverage and ratingCount from its VISIBLE reviews.
 *
 * It uses an AGGREGATION PIPELINE: a list of steps MongoDB runs inside the database, each
 * step passing its output to the next (like an assembly line). Here:
 *   $match → keep only this product's visible reviews
 *   $group → squash them into ONE result: { avg: average rating, count: how many }
 * Only that tiny result travels to Node, instead of every review document.
 */
reviewSchema.statics.calcProductRating = async function calcProductRating(productId) {
  // `this` is the Review model. `[stats]` takes the first (and only) group, or undefined
  // when the product has no visible reviews left.
  const [stats] = await this.aggregate([
    // aggregate() does NOT cast types like find() does, so we turn the id into an ObjectId
    { $match: { product: new mongoose.Types.ObjectId(String(productId)), isVisible: true } },
    { $group: { _id: '$product', avg: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);
  // Write the copy onto the product. No reviews → back to 0 / 0 (not "null stars").
  await mongoose.model('Product').updateOne(
    { _id: productId },
    {
      // One decimal place, e.g. 4.333… → 4.3 (what the stars UI shows)
      ratingAverage: stats ? Math.round(stats.avg * 10) / 10 : 0,
      ratingCount: stats ? stats.count : 0,
    },
  );
};

/* ---------- Hooks: keep the denormalized rating in sync ---------- */
// A "post" hook runs AFTER the database write succeeded. Returning the promise makes
// Mongoose wait for it, so the API answers only once the product rating is up to date.

// After Review.create() / review.save() → a new or edited review
reviewSchema.post('save', function afterSave(doc) {
  return doc.constructor.calcProductRating(doc.product);
});
// After Review.findOneAndUpdate() → edits by the owner and hide/show by an admin
reviewSchema.post('findOneAndUpdate', async (doc) => {
  // `doc` is null when nothing matched (e.g. not your review) → nothing to recalculate
  if (doc) await doc.constructor.calcProductRating(doc.product);
});
// After Review.findOneAndDelete() → the review no longer counts
reviewSchema.post('findOneAndDelete', async (doc) => {
  if (doc) await doc.constructor.calcProductRating(doc.product);
});
// NOTE: bulk writes such as Review.deleteMany() do NOT run these hooks. That is fine for
// the one place that uses it (deleting a whole product removes its reviews too).

// Clean JSON output (no __v, no duplicate `id`)
reviewSchema.plugin(toJSON);

// Reuse the model if it already exists (avoids "OverwriteModelError" on hot reload)
export default mongoose.models.Review || mongoose.model('Review', reviewSchema);
