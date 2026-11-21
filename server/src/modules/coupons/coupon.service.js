/**
 * src/modules/coupons/coupon.service.js – business logic for coupons.
 *
 * Layers: routes → controller → SERVICE → model. No req/res here; errors are ApiErrors.
 * Used by: coupon.controller.js. (Branch 07's order service uses the MODEL methods directly:
 * checkUsable, calculateDiscount and the atomic Coupon.consume.)
 *
 * Two audiences:
 *  - CUSTOMER: previewCoupon → "what would this code do to MY cart right now?"
 *    A preview never uses the coupon up. The real use happens once, atomically, at checkout
 *    (branch 07), where the coupon is checked AGAIN because it may expire in between.
 *  - ADMIN: list / get / create / update / delete.
 */
import { Coupon, Order } from '../models.js';
import ApiError from '../../utils/ApiError.js';
import { calcTotals } from '../../utils/pricing.js';
import { getCartWithTotals } from '../cart/cart.service.js';

// The ONLY fields an admin may set. usedCount, createdBy, _id… are never copied from the
// body (mass assignment protection): the counter changes only through checkouts.
const FIELDS = [
  'code',
  'description',
  'type',
  'value',
  'maxDiscount',
  'minOrderAmount',
  'startsAt',
  'expiresAt',
  'usageLimit',
  'isActive',
];
// Copies the allowed fields that were actually sent: pick({ value: 5, usedCount: 0 }) → { value: 5 }
const pick = (body) =>
  Object.fromEntries(FIELDS.filter((f) => body[f] !== undefined).map((f) => [f, body[f]]));

// Codes are compared in UPPERCASE everywhere: " eid25 " finds the coupon saved as "EID25"
const normalizeCode = (code) => String(code).trim().toUpperCase();

const notFound = () => new ApiError(404, 'Coupon not found');

/**
 * Refuses a code that another coupon already uses → 409 Conflict with a clear message.
 * The unique index on `code` is the real guarantee (two admins saving at the same instant
 * both pass this check, and the index then refuses the second: error 11000 → also 409 in
 * error.middleware.js). This friendly check just gives the usual case a nicer message.
 */
async function assertCodeFree(code, excludeId = null) {
  const filter = { code: normalizeCode(code) };
  if (excludeId) filter._id = { $ne: excludeId }; // on update, "my own code" is fine
  if (await Coupon.exists(filter)) {
    throw new ApiError(409, 'Coupon code already exists', [
      { field: 'code', message: 'Coupon code already exists' },
    ]);
  }
}

// ---------- Customer ----------

/**
 * Preview a coupon on the logged-in customer's CURRENT cart.
 * The subtotal is calculated on the server from today's product prices (never sent by the
 * client), so a customer cannot claim "my cart is worth Rs 1,000,000" to unlock a coupon.
 */
export async function previewCoupon(userId, code) {
  const coupon = await Coupon.findOne({ code: normalizeCode(code) });
  if (!coupon) throw notFound();

  const cart = await getCartWithTotals(userId);
  if (!cart.items.length) throw new ApiError(400, 'Your cart is empty');
  // All items unavailable (out of stock / deactivated) → nothing to discount
  if (cart.subtotal <= 0) throw new ApiError(400, 'Your cart has no items that can be bought');

  // Active? Inside its validity window? Uses left? Minimum order reached?
  const check = coupon.checkUsable(cart.subtotal);
  if (!check.ok) throw new ApiError(400, check.reason);

  const discount = coupon.calculateDiscount(cart.subtotal);
  return {
    code: coupon.code,
    type: coupon.type,
    value: coupon.value,
    description: coupon.description,
    // itemsPrice, discountPrice, shippingPrice, taxPrice, totalPrice – the same helper the
    // checkout uses, so the preview and the final order show identical numbers
    ...calcTotals(cart.subtotal, discount),
  };
}

// ---------- Admin ----------

/** Every coupon, newest first. Not .lean(), so the `state` virtual is included. */
export function listCoupons() {
  return Coupon.find().sort({ createdAt: -1, _id: -1 });
}

/** One coupon by id (for the admin edit form). */
export async function getCoupon(id) {
  const coupon = await Coupon.findById(id);
  if (!coupon) throw notFound();
  return coupon;
}

/** Create a coupon. The creator is the logged-in admin (from the token). */
export async function createCoupon(adminId, body) {
  await assertCodeFree(body.code);
  return Coupon.create({ ...pick(body), createdBy: adminId });
}

/** Replace a coupon's settings (the admin form always sends every field). */
export async function updateCoupon(id, body) {
  const coupon = await Coupon.findById(id);
  if (!coupon) throw notFound();
  await assertCodeFree(body.code, id);
  Object.assign(coupon, pick(body)); // only the allowed fields
  // An empty optional field in the form means "remove it": no cap / unlimited uses
  if (!body.maxDiscount) coupon.maxDiscount = undefined;
  if (!body.usageLimit) coupon.usageLimit = null;
  await coupon.save(); // runs every model validator again (value range, date order…)
  return coupon;
}

/**
 * Delete a coupon – but only if nobody has used it yet. A used coupon is part of order
 * history, so it is only DEACTIVATED (a "soft delete"): old orders keep pointing at it.
 */
export async function deleteCoupon(id) {
  const coupon = await Coupon.findById(id);
  if (!coupon) throw notFound();
  // Used (usedCount > 0) OR referenced by any order (even a cancelled one whose use was
  // released) → only deactivate, so order history never points at a missing coupon.
  if (coupon.usedCount > 0 || (await Order.exists({ 'coupon.coupon': id }))) {
    coupon.isActive = false;
    await coupon.save();
    return { deactivated: true };
  }
  await coupon.deleteOne();
  return { deactivated: false };
}
