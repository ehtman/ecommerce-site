/**
 * src/modules/coupons/coupon.model.js – the Coupon collection: discount codes such as EID25.
 *
 * WHAT: One document per code. An admin creates it; a customer types the code at checkout.
 * WHY:  Discounts are money. Every rule that protects that money (how much off, from when to
 *       when, how many times) lives HERE, next to the data, so the coupon preview (branch 06)
 *       and the real checkout (branch 07) can never disagree about it.
 * WHERE: routes → controller → service → MODEL → MongoDB. Used by coupon.service.js now and by
 *       the order service in branch 07 (checkUsable → calculateDiscount → consume).
 *
 * Business rules (invariants):
 *  - the code is unique and stored in UPPERCASE ("eid25" and "EID25" are the same coupon)
 *  - percentage coupons give 1–90% off (optionally capped by maxDiscount); fixed coupons give
 *    Rs 1–100,000 off. Every amount is a whole number of rupees.
 *  - a coupon only works inside its VALIDITY WINDOW: startsAt ≤ now ≤ expiresAt
 *  - usedCount never goes above usageLimit, even when many customers check out at once
 *    (see `consume` below and docs/concepts/19-coupons-money-math-and-atomic-counters.md)
 *  - the discount is never larger than the items subtotal (no negative totals)
 */
import mongoose from 'mongoose';
import toJSON from '../../db/plugins/toJSON.js';
import { COUPON_TYPES, LIMITS, REGEX } from '../../config/constants.js';

const { Schema } = mongoose;

// Reusable validator: "this number must be whole". `v == null` lets optional fields stay empty.
// Money is kept in whole rupees, so 99.5 is refused instead of silently rounded.
const int = {
  validator: (v) => v == null || Number.isInteger(v),
  message: '{PATH} must be a whole number', // Mongoose replaces {PATH} with the field name
};

const couponSchema = new Schema(
  {
    // The text the customer types. `unique` builds a unique index (duplicates → error 11000 →
    // 409). `uppercase` converts before saving, so the index compares "EID25" with "EID25".
    code: {
      type: String,
      required: [true, 'Code is required'],
      unique: true,
      uppercase: true,
      trim: true,
      match: [REGEX.COUPON_CODE, 'Code must be 3–20 letters or digits'],
    },
    // Optional note shown to admins (and to customers in the preview), e.g. "Eid sale 2026"
    description: { type: String, trim: true, maxlength: [150, 'Description is too long'] },
    // percentage | fixed (see COUPON_TYPES in config/constants.js)
    type: {
      type: String,
      required: [true, 'Type is required'],
      enum: { values: Object.values(COUPON_TYPES), message: 'Type must be percentage or fixed' },
    },
    // How much off: a percent (10 = 10%) or whole rupees (500 = Rs 500), depending on `type`
    value: {
      type: Number,
      required: [true, 'Value is required'],
      validate: [
        int,
        {
          // A normal function (not an arrow) so `this` is the coupon being validated
          validator(v) {
            return this.type === COUPON_TYPES.PERCENTAGE
              ? v >= 1 && v <= LIMITS.COUPON_MAX_PERCENT
              : v >= 1 && v <= LIMITS.COUPON_MAX_FIXED;
          },
          message: `Percentage must be 1–${LIMITS.COUPON_MAX_PERCENT}, fixed amount 1–${LIMITS.COUPON_MAX_FIXED}`,
        },
      ],
    },
    // Optional CAP for percentage coupons: "20% off, at most Rs 1,000". Without a cap a 20%
    // coupon on a Rs 500,000 TV would give Rs 100,000 away.
    maxDiscount: { type: Number, min: [1, 'Max discount must be at least 1'], validate: int },
    // The items subtotal must be at least this much for the coupon to work (0 = any cart)
    minOrderAmount: {
      type: Number,
      default: 0,
      min: [0, 'Minimum order cannot be negative'],
      validate: int,
    },
    // VALIDITY WINDOW. Dates are stored in UTC, so the server's time zone never matters.
    // `default: Date.now` (no brackets!) means "now at the moment of creation".
    startsAt: { type: Date, default: Date.now },
    expiresAt: {
      type: Date,
      required: [true, 'Expiry date is required'],
      validate: {
        // A window that ends before it starts could never be used: refuse it
        validator(v) {
          return !this.startsAt || v > this.startsAt;
        },
        message: 'Expiry must be after start date',
      },
    },
    // How many times the coupon may be used IN TOTAL (null = unlimited)
    usageLimit: {
      type: Number,
      min: [1, 'Usage limit must be at least 1'],
      default: null,
      validate: int,
    },
    // How many times it HAS been used. Only changed with atomic $inc (consume/release below),
    // never with "read, add one, save", which loses updates under concurrency.
    usedCount: { type: Number, default: 0, min: 0 },
    // Admin "off switch": a disabled coupon keeps its history but cannot be used
    isActive: { type: Boolean, default: true },
    // Which admin created it (always from the token, never from the request body)
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }, // createdAt / updatedAt
);

/* ---------- Indexes ---------- */
// `code` already has its unique index (from `unique: true` above): lookups by code are fast.
// This one helps "which coupons are running right now?" queries (admin dashboards, branch 10).
couponSchema.index({ isActive: 1, expiresAt: 1 });

/* ---------- Virtuals ---------- */
/**
 * `state` – a human-friendly status for the admin table, computed on the fly (not stored,
 * because "expired" changes with the clock, not with a write).
 * disabled | used-up | scheduled | expired | active
 */
couponSchema.virtual('state').get(function state() {
  const now = new Date();
  if (!this.isActive) return 'disabled';
  if (this.usageLimit != null && this.usedCount >= this.usageLimit) return 'used-up';
  if (now < this.startsAt) return 'scheduled'; // window has not opened yet
  if (now > this.expiresAt) return 'expired'; // window has closed
  return 'active';
});

/* ---------- Methods (run on ONE coupon) ---------- */
/**
 * checkUsable(subtotal, now) – may this coupon be used on a cart worth `subtotal`?
 * Returns { ok: true } or { ok: false, reason } instead of throwing, so the caller decides
 * the HTTP status. `now` is a parameter so unit tests can "travel in time".
 * The checks run cheapest-first and the FIRST failing rule is the reason shown.
 */
couponSchema.methods.checkUsable = function checkUsable(subtotal, now = new Date()) {
  if (!this.isActive) return { ok: false, reason: 'Coupon is not active' };
  if (now < this.startsAt) return { ok: false, reason: 'Coupon is not active yet' };
  if (now > this.expiresAt) return { ok: false, reason: 'Coupon expired' };
  // usageLimit null = unlimited, so only compare when a limit exists
  if (this.usageLimit != null && this.usedCount >= this.usageLimit) {
    return { ok: false, reason: 'Coupon usage limit reached' };
  }
  if (subtotal < this.minOrderAmount) {
    // toLocaleString('en-PK') prints 5000 as "5,000"
    return {
      ok: false,
      reason: `Minimum order is Rs ${this.minOrderAmount.toLocaleString('en-PK')}`,
    };
  }
  return { ok: true };
};

/**
 * calculateDiscount(subtotal) – how many whole rupees this coupon takes off.
 *
 * INTEGER MATH: 15% of Rs 999 is 149.85. We round DOWN with Math.floor (→ 149), so the shop
 * never gives away a fraction of a rupee and every total stays a whole number.
 * Multiply FIRST, then divide: (999 * 15) / 100 keeps more precision than 999 * 0.15.
 */
couponSchema.methods.calculateDiscount = function calculateDiscount(subtotal) {
  let discount =
    this.type === COUPON_TYPES.PERCENTAGE
      ? Math.floor((subtotal * this.value) / 100) // percent of the subtotal, rounded down
      : this.value; // fixed: the amount itself
  // The cap only applies to percentage coupons (a fixed coupon IS already a fixed amount)
  if (this.type === COUPON_TYPES.PERCENTAGE && this.maxDiscount) {
    discount = Math.min(discount, this.maxDiscount);
  }
  // A Rs 500 coupon on a Rs 300 cart gives Rs 300 off, never "minus Rs 200"
  return Math.min(discount, subtotal);
};

/* ---------- Statics (run on the whole collection) ---------- */
/**
 * Coupon.consume(id, session) – use the coupon ONCE, atomically. Returns true if it worked.
 *
 * RACE CONDITION: two customers check out at the same moment with the last remaining use.
 * "Read usedCount (9), compare with limit (10), save 10" run by both → both pass → 11 uses.
 * Instead ONE updateOne both CHECKS and INCREMENTS: MongoDB applies it to a document as one
 * indivisible step, so the second request finds usedCount = 10, matches nothing and gets false.
 * `$expr` lets the filter compare two fields of the same document (usedCount < usageLimit).
 * Called by the order service in branch 07, inside its checkout transaction (`session`).
 */
couponSchema.statics.consume = async function consume(couponId, session) {
  const result = await this.updateOne(
    {
      _id: couponId,
      isActive: true,
      // unlimited OR still below the limit
      $or: [{ usageLimit: null }, { $expr: { $lt: ['$usedCount', '$usageLimit'] } }],
    },
    { $inc: { usedCount: 1 } }, // +1, done by the database, not by our code
    { session },
  );
  return result.modifiedCount === 1; // 0 = limit reached (or disabled) in the meantime
};

/**
 * Coupon.release(id, session) – give one use back (branch 07: an order with a coupon is
 * cancelled). `usedCount > 0` in the filter means the counter can never become negative.
 */
couponSchema.statics.release = function release(couponId, session) {
  return this.updateOne(
    { _id: couponId, usedCount: { $gt: 0 } },
    { $inc: { usedCount: -1 } },
    { session },
  );
};

// Clean JSON output (no __v, includes the `state` virtual)
couponSchema.plugin(toJSON);

// Reuse the model if it already exists (avoids "OverwriteModelError" on hot reload)
export default mongoose.models.Coupon || mongoose.model('Coupon', couponSchema);
