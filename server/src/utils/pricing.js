/**
 * src/utils/pricing.js – pure money helpers: shipping and totals.
 *
 * WHAT: Small functions that take numbers and return numbers. No database, no req/res.
 * WHY:  Money rules must be calculated on the SERVER, in ONE place. If the browser sent
 *       "total: 10", a cheater could pay Rs 10 for anything. So the server reads prices from
 *       the database and does the maths itself (server-side price calculation).
 *       Pure functions are also the easiest code to unit test (tests/unit/pricing.test.js).
 * WHERE: cart.service.js uses calcShipping for the cart summary. The coupon preview (branch 06)
 *       and orders (branch 07) use calcTotals to build the price breakdown with a discount.
 *
 * All amounts are WHOLE RUPEES (BR-01): product prices are integers, so sums and products
 * of them stay integers. No floating-point rounding errors like 0.1 + 0.2 = 0.30000000000000004.
 * See docs/concepts/18-transactions-and-atomic-updates.md (section "server-side prices").
 */
import { PRICING } from '../config/constants.js';

/**
 * BR-02: shipping is Rs 250, or FREE when the amount is Rs 5,000 or more.
 * An empty cart (amount 0) pays no shipping, because nothing is shipped.
 * @param {number} amount subtotal in rupees (after any discount)
 * @returns {number} shipping fee in rupees
 */
export function calcShipping(amount) {
  if (amount <= 0) return 0; // nothing to ship → no fee
  // ">=": exactly Rs 5,000 already qualifies for free delivery
  return amount >= PRICING.FREE_SHIPPING_MIN ? 0 : PRICING.SHIPPING_FEE;
}

/**
 * calcTotals(itemsPrice, discountPrice) – the money summary of a cart or an order (branch 06).
 *
 * Used by: the coupon preview (POST /api/coupons/validate) and, in branch 07, by checkout,
 * so the customer sees EXACTLY the numbers the order will later store.
 *
 * Every amount is a whole number of rupees (an integer). Integers add and subtract exactly;
 * decimals do not (in JavaScript 0.1 + 0.2 === 0.30000000000000004). The discount is
 * already rounded down by the coupon before it arrives here, so no rounding is needed.
 *
 * Example: calcTotals(4000, 400) → { itemsPrice: 4000, discountPrice: 400,
 *          shippingPrice: 250, taxPrice: 0, totalPrice: 3850 }
 */
export function calcTotals(itemsPrice, discountPrice = 0) {
  // What the customer pays for the goods once the coupon is taken off
  const afterDiscount = itemsPrice - discountPrice;
  // Free shipping is judged on the amount AFTER the discount: a coupon must not push a
  // Rs 5,200 cart down to Rs 4,700 and still ship it free. An empty cart pays no shipping.
  const shippingPrice = itemsPrice > 0 ? calcShipping(afterDiscount) : 0;
  const taxPrice = 0; // prices already include tax (PRICING.TAX_RATE is 0)
  return {
    itemsPrice, // sum of price × quantity
    discountPrice, // what the coupon takes off
    shippingPrice, // Rs 250, or 0 when free
    taxPrice,
    totalPrice: afterDiscount + shippingPrice + taxPrice, // what the customer pays
  };
}
