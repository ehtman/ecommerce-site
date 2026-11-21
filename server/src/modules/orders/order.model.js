/**
 * src/modules/orders/order.model.js – the Order collection: one document per placed order.
 *
 * WHAT: An order is a frozen RECEIPT. It copies ("snapshots") everything it needs from other
 *       collections at the moment of purchase: product name/price/image, the delivery
 *       address and the coupon. It also stores the money breakdown and its status history.
 * WHY SNAPSHOTS? Products change price, addresses get edited, coupons get deleted. A receipt
 *       must NEVER change after the fact ("you paid Rs 1,000", not "whatever the price is
 *       today"). So we copy the values instead of only pointing at them.
 *       See docs/concepts/21-state-machines-and-snapshots.md.
 * WHY A STATE MACHINE? `status` may only move along the arrows in ORDER_TRANSITIONS
 *       (BR-08). changeStatus() below is the ONLY place that moves it, so an invalid jump
 *       such as "delivered → pending" is impossible no matter which route asks for it.
 * WHERE: routes → controller → order.service.js → MODEL → MongoDB.
 *
 * Invariants (must always be true, checked in the hooks below):
 *  - at least one item; every item's subtotal = price × quantity
 *  - totalPrice = itemsPrice − discountPrice + shippingPrice + taxPrice (whole rupees, BR-01)
 *  - the discount is never larger than the items price
 *  - a shipped order has a tracking number
 */
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import toJSON from '../../db/plugins/toJSON.js';
import ApiError from '../../utils/ApiError.js';
import {
  ORDER_STATUS,
  ORDER_TRANSITIONS,
  CUSTOMER_CANCELLABLE,
  PAYMENT_METHODS,
  PAYMENT_STATUS,
  COUPON_TYPES,
  PROVINCES,
  REGEX,
  LIMITS,
} from '../../config/constants.js';

const { Schema } = mongoose;

// Every money field: a required whole number of rupees, never negative (BR-01).
// Whole numbers avoid floating-point surprises such as 0.1 + 0.2 = 0.30000000000000004.
const money = {
  type: Number,
  required: true,
  min: 0,
  validate: { validator: Number.isInteger, message: '{PATH} must be a whole number' },
};

/* ---------- Sub-documents (stored INSIDE the order) ---------- */

// One line of the receipt. `product` is kept as a link (for reviews and reports), but the
// name, slug, sku, image and price are COPIES taken at checkout time (the snapshot).
const orderItemSchema = new Schema(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    name: { type: String, required: true },
    slug: { type: String, required: true },
    sku: { type: String, required: true },
    image: { type: String, required: true },
    price: { ...money, min: 1 }, // the unit price the customer actually paid
    quantity: { type: Number, required: true, min: 1, max: LIMITS.MAX_CART_QTY },
    subtotal: money, // price × quantity (recalculated below, never trusted from outside)
  },
  { _id: false }, // items are never addressed on their own, so they need no id
);
// Recalculate the line total before validation so it can never be wrong
orderItemSchema.pre('validate', function itemSubtotal() {
  this.subtotal = this.price * this.quantity;
});

// A COPY of the customer's address (see Address.toSnapshot). Editing or deleting the saved
// address later does not move a parcel that is already on its way.
const shippingAddressSchema = new Schema(
  {
    fullName: { type: String, required: true },
    phone: { type: String, required: true, match: REGEX.PK_PHONE },
    addressLine1: { type: String, required: true },
    addressLine2: String,
    city: { type: String, required: true },
    province: { type: String, required: true, enum: PROVINCES },
    postalCode: { type: String, required: true, match: REGEX.POSTAL_CODE },
    country: { type: String, default: 'Pakistan' },
  },
  { _id: false },
);

// Card payment details. Branch 08: filled in by the Stripe checkout/webhook.
const paymentResultSchema = new Schema(
  {
    provider: { type: String, enum: ['stripe'] },
    sessionId: String,
    paymentIntentId: String,
    paidAt: Date,
  },
  { _id: false },
);

// A COPY of the coupon as it was at checkout (the admin may change or delete it later)
const couponSnapshotSchema = new Schema(
  {
    coupon: { type: Schema.Types.ObjectId, ref: 'Coupon', required: true }, // to give the use back
    code: { type: String, required: true },
    type: { type: String, enum: Object.values(COUPON_TYPES), required: true },
    value: { type: Number, required: true },
    discount: money, // the rupees this coupon saved on THIS order
  },
  { _id: false },
);

// One row per status change: an audit trail ("who did what, when, and why")
const statusEntrySchema = new Schema(
  {
    status: { type: String, enum: Object.values(ORDER_STATUS), required: true },
    note: { type: String, trim: true, maxlength: 200 },
    changedBy: { type: Schema.Types.ObjectId, ref: 'User' }, // null = the system (job/webhook)
    at: { type: Date, default: Date.now },
  },
  { _id: false },
);

/* ---------- The order itself ---------- */
const orderSchema = new Schema(
  {
    // Human-friendly number for emails and support calls, e.g. ORD-20261117-48213.
    // `unique` makes MongoDB refuse a duplicate (the service retries once if that happens).
    orderNumber: { type: String, unique: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true }, // the OWNER
    items: {
      type: [orderItemSchema],
      validate: { validator: (a) => a.length > 0, message: 'Order must have at least one item' },
    },
    shippingAddress: { type: shippingAddressSchema, required: true },

    paymentMethod: {
      type: String,
      enum: Object.values(PAYMENT_METHODS),
      default: PAYMENT_METHODS.COD,
    },
    paymentStatus: {
      type: String,
      enum: Object.values(PAYMENT_STATUS),
      default: PAYMENT_STATUS.PENDING,
    },
    // `default: undefined` = the field is simply absent (not an empty object) when unused
    paymentResult: { type: paymentResultSchema, default: undefined },
    coupon: { type: couponSnapshotSchema, default: undefined },

    // The money breakdown. ALL of it is calculated by the server (utils/pricing.js);
    // a client can never send its own prices.
    itemsPrice: money,
    discountPrice: { ...money, default: 0 },
    shippingPrice: money,
    taxPrice: { ...money, default: 0 },
    totalPrice: money,

    status: { type: String, enum: Object.values(ORDER_STATUS), default: ORDER_STATUS.PENDING },
    statusHistory: { type: [statusEntrySchema], default: [] },
    trackingNumber: {
      type: String,
      trim: true,
      maxlength: 50,
      // A function as `required`: the rule only applies once the order is shipped
      required: [
        function needsTracking() {
          return this.status === ORDER_STATUS.SHIPPED;
        },
        'Tracking number is required when shipping',
      ],
    },
    note: { type: String, trim: true, maxlength: 300 }, // the customer's delivery note
    cancelReason: { type: String, trim: true, maxlength: 200 },
    paidAt: Date,
    deliveredAt: Date,
    cancelledAt: Date,
  },
  { timestamps: true }, // createdAt = when the order was placed
);

/* ---------- Indexes (one per common query) ---------- */
orderSchema.index({ user: 1, createdAt: -1 }); // "my orders", newest first
orderSchema.index({ status: 1, createdAt: -1 }); // admin list filtered by status
orderSchema.index({ createdAt: -1 }); // admin list and reports
orderSchema.index({ paymentMethod: 1, paymentStatus: 1, createdAt: 1 }); // branch 08: expire unpaid CARD orders
orderSchema.index({ 'items.product': 1, user: 1, status: 1 }); // branch 09: "did you buy this?"
orderSchema.index({ 'paymentResult.sessionId': 1 }, { sparse: true }); // branch 08: Stripe webhook lookup

/* ---------- Hooks ---------- */
// Runs before every validation (so before every save)
orderSchema.pre('validate', function numberAndTotals() {
  // 1) Give a new order its number: ORD-<yyyymmdd>-<5 random digits>
  if (!this.orderNumber) {
    const d = new Date();
    const ymd = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(
      d.getUTCDate(),
    ).padStart(2, '0')}`;
    // crypto.randomInt is a secure random number; order numbers should not be guessable
    this.orderNumber = `ORD-${ymd}-${crypto.randomInt(10000, 99999)}`;
  }
  // 2) The total MUST equal its parts. If any code computes it wrongly, saving fails loudly.
  const expected = this.itemsPrice - this.discountPrice + this.shippingPrice + this.taxPrice;
  if (this.totalPrice !== expected) this.invalidate('totalPrice', 'Total does not match its parts');
  if (this.discountPrice > this.itemsPrice) {
    this.invalidate('discountPrice', 'Discount exceeds items price');
  }
  // 3) Start the audit trail with "placed" (by the customer)
  if (this.isNew && this.statusHistory.length === 0) {
    this.statusHistory.push({ status: this.status, note: 'Order placed', changedBy: this.user });
  }
});

/* ---------- Instance methods: the state machine ---------- */

/** May this order move to `next`? Looks the arrow up in ORDER_TRANSITIONS (BR-08). */
orderSchema.methods.canTransitionTo = function canTransitionTo(next) {
  // `?.` and `??` keep it safe for an unknown status: no arrows → false
  return ORDER_TRANSITIONS[this.status]?.includes(next) ?? false;
};

/** May the CUSTOMER still cancel it? Only while pending or confirmed (BR-06). */
orderSchema.methods.isCancellableByCustomer = function isCancellableByCustomer() {
  return CUSTOMER_CANCELLABLE.includes(this.status);
};

/**
 * Moves the order to `next` and records it in the history. The ONLY place `status` changes.
 * It does NOT save and does NOT touch stock: the service does that inside a transaction.
 * @param {string} next  the wanted status
 * @param {{by?: any, note?: string, trackingNumber?: string}} [options]
 */
orderSchema.methods.changeStatus = function changeStatus(
  next,
  { by = null, note, trackingNumber } = {},
) {
  // Refuse any jump that is not an arrow of the state machine
  if (!this.canTransitionTo(next)) {
    throw new ApiError(400, `Cannot change status from ${this.status} to ${next}`);
  }
  this.status = next;
  if (trackingNumber) this.trackingNumber = trackingNumber;
  if (next === ORDER_STATUS.DELIVERED) {
    this.deliveredAt = new Date();
    // Cash on Delivery: the courier collected the money, so the order is now paid
    if (this.paymentMethod === PAYMENT_METHODS.COD) {
      this.paymentStatus = PAYMENT_STATUS.PAID;
      this.paidAt = new Date();
    }
  }
  if (next === ORDER_STATUS.CANCELLED) {
    this.cancelledAt = new Date();
    this.cancelReason = note;
  }
  this.statusHistory.push({ status: next, note, changedBy: by }); // the audit trail
  return this; // lets callers chain: order.changeStatus(...).save()
};

orderSchema.plugin(toJSON); // clean JSON output (no __v)

// Reuse the model if it already exists (avoids "OverwriteModelError" on hot reload)
export default mongoose.models.Order || mongoose.model('Order', orderSchema);
