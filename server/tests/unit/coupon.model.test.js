/**
 * UNIT tests for the Coupon model's pure logic and for the calcTotals pricing helper.
 * No database needed: the methods only read the coupon's own fields, and `validateSync()`
 * runs the schema validators in memory.
 *
 * The edge cases here are the ones that cost real money when they are wrong:
 * rounding, the max-discount cap, a fixed coupon bigger than the cart, the minimum order,
 * the validity window (not yet active / expired) and an exhausted usage limit.
 */
import mongoose from 'mongoose';
import { Coupon } from '../../src/modules/models.js';
import { calcTotals, calcShipping } from '../../src/utils/pricing.js';
import { COUPON_TYPES, LIMITS, PRICING, REGEX } from '../../src/config/constants.js';

const DAY = 24 * 60 * 60 * 1000;
const now = new Date('2026-06-15T12:00:00Z'); // a fixed "today" so tests never depend on the clock

// A coupon in memory (never saved). Valid by default: 10% off, window around `now`.
const coupon = (overrides = {}) =>
  new Coupon({
    code: 'EID10',
    type: COUPON_TYPES.PERCENTAGE,
    value: 10,
    startsAt: new Date(now.getTime() - DAY),
    expiresAt: new Date(now.getTime() + DAY),
    createdBy: new mongoose.Types.ObjectId(),
    ...overrides,
  });

describe('Coupon constants', () => {
  it('has the two coupon types and a strict code pattern', () => {
    expect(Object.values(COUPON_TYPES)).toEqual(['percentage', 'fixed']);
    expect(REGEX.COUPON_CODE.test('EID25')).toBe(true);
    expect(REGEX.COUPON_CODE.test('eid25')).toBe(false); // stored codes are uppercase
    expect(REGEX.COUPON_CODE.test('AB')).toBe(false); // too short
    expect(REGEX.COUPON_CODE.test('EID-25')).toBe(false); // no symbols
    expect(REGEX.COUPON_CODE.test('A'.repeat(21))).toBe(false); // too long
  });
});

describe('Coupon schema', () => {
  it('accepts a valid coupon and fills the defaults', () => {
    const c = coupon();
    expect(c.validateSync()).toBeUndefined();
    expect(c.minOrderAmount).toBe(0);
    expect(c.usageLimit).toBeNull(); // unlimited
    expect(c.usedCount).toBe(0);
    expect(c.isActive).toBe(true);
  });

  it('stores the code trimmed and in UPPERCASE', () => {
    expect(coupon({ code: '  eid10 ' }).code).toBe('EID10');
  });

  it('requires code, type, value, expiry and creator', () => {
    const { errors } = new Coupon({}).validateSync();
    ['code', 'type', 'value', 'expiresAt', 'createdBy'].forEach((f) =>
      expect(errors[f]).toBeDefined(),
    );
  });

  it('rejects a bad code and an unknown type', () => {
    const { errors } = coupon({ code: 'NO SPACES', type: 'bogo' }).validateSync();
    expect(errors.code.message).toBe('Code must be 3–20 letters or digits');
    expect(errors.type.message).toBe('Type must be percentage or fixed');
  });

  it.each([
    ['percentage above the maximum', { value: LIMITS.COUPON_MAX_PERCENT + 1 }],
    ['percentage of zero', { value: 0 }],
    ['fixed above the maximum', { type: 'fixed', value: LIMITS.COUPON_MAX_FIXED + 1 }],
    ['a decimal value', { value: 12.5 }],
  ])('rejects %s', (_name, overrides) => {
    expect(coupon(overrides).validateSync().errors.value).toBeDefined();
  });

  it('accepts the exact maximums', () => {
    expect(coupon({ value: LIMITS.COUPON_MAX_PERCENT }).validateSync()).toBeUndefined();
    expect(
      coupon({ type: 'fixed', value: LIMITS.COUPON_MAX_FIXED }).validateSync(),
    ).toBeUndefined();
  });

  it('rejects an expiry that is not after the start', () => {
    const { errors } = coupon({ expiresAt: new Date(now.getTime() - 2 * DAY) }).validateSync();
    expect(errors.expiresAt.message).toBe('Expiry must be after start date');
  });

  it('rejects impossible limits and amounts', () => {
    const { errors } = coupon({
      usageLimit: 0,
      minOrderAmount: -1,
      maxDiscount: 0,
    }).validateSync();
    expect(errors.usageLimit).toBeDefined();
    expect(errors.minOrderAmount).toBeDefined();
    expect(errors.maxDiscount).toBeDefined();
  });
});

describe('coupon.calculateDiscount (integer money math)', () => {
  it('takes a percentage of the subtotal', () => {
    expect(coupon({ value: 10 }).calculateDiscount(4000)).toBe(400);
  });

  it('rounds DOWN to whole rupees (15% of 999 = 149.85 → 149)', () => {
    expect(coupon({ value: 15 }).calculateDiscount(999)).toBe(149);
  });

  it('caps a percentage discount at maxDiscount', () => {
    const c = coupon({ value: 50, maxDiscount: 1000 });
    expect(c.calculateDiscount(10_000)).toBe(1000); // 50% would be 5,000
    expect(c.calculateDiscount(1000)).toBe(500); // under the cap → normal 50%
  });

  it('gives the fixed amount and ignores maxDiscount for fixed coupons', () => {
    expect(coupon({ type: 'fixed', value: 500, maxDiscount: 100 }).calculateDiscount(4000)).toBe(
      500,
    );
  });

  it('never gives more than the subtotal (fixed coupon bigger than the cart)', () => {
    expect(coupon({ type: 'fixed', value: 5000 }).calculateDiscount(3000)).toBe(3000);
  });

  it('always returns a whole number', () => {
    [1, 7, 33, 999, 12_345].forEach((subtotal) => {
      expect(Number.isInteger(coupon({ value: 17 }).calculateDiscount(subtotal))).toBe(true);
    });
  });
});

describe('coupon.checkUsable (validity window, limits, minimum order)', () => {
  it('is usable inside its window', () => {
    expect(coupon().checkUsable(1000, now)).toEqual({ ok: true });
  });

  it('refuses a disabled coupon', () => {
    expect(coupon({ isActive: false }).checkUsable(1000, now)).toEqual({
      ok: false,
      reason: 'Coupon is not active',
    });
  });

  it('refuses a coupon that has not started yet', () => {
    const c = coupon({
      startsAt: new Date(now.getTime() + DAY),
      expiresAt: new Date(now.getTime() + 2 * DAY),
    });
    expect(c.checkUsable(1000, now).reason).toBe('Coupon is not active yet');
  });

  it('refuses an expired coupon', () => {
    const c = coupon({
      startsAt: new Date(now.getTime() - 2 * DAY),
      expiresAt: new Date(now.getTime() - DAY),
    });
    expect(c.checkUsable(1000, now).reason).toBe('Coupon expired');
  });

  it('includes both edges of the window (start and expiry moments)', () => {
    const c = coupon({ startsAt: now, expiresAt: new Date(now.getTime() + DAY) });
    expect(c.checkUsable(1000, now).ok).toBe(true);
    expect(c.checkUsable(1000, c.expiresAt).ok).toBe(true);
  });

  it('refuses a coupon whose usage limit is used up', () => {
    const c = coupon({ usageLimit: 3, usedCount: 3 });
    expect(c.checkUsable(1000, now).reason).toBe('Coupon usage limit reached');
    expect(coupon({ usageLimit: 3, usedCount: 2 }).checkUsable(1000, now).ok).toBe(true);
  });

  it('treats usageLimit null as unlimited', () => {
    expect(coupon({ usageLimit: null, usedCount: 1_000_000 }).checkUsable(1000, now).ok).toBe(true);
  });

  it('enforces the minimum order, with a readable amount in the message', () => {
    const c = coupon({ minOrderAmount: 5000 });
    expect(c.checkUsable(4999, now)).toEqual({ ok: false, reason: 'Minimum order is Rs 5,000' });
    expect(c.checkUsable(5000, now).ok).toBe(true); // exactly the minimum is enough
  });

  it('uses the real clock when no date is given', () => {
    const c = coupon({
      startsAt: new Date(Date.now() - DAY),
      expiresAt: new Date(Date.now() + DAY),
    });
    expect(c.checkUsable(1000).ok).toBe(true);
  });
});

describe('coupon.state (admin status)', () => {
  const live = { startsAt: new Date(Date.now() - DAY), expiresAt: new Date(Date.now() + DAY) };

  it.each([
    ['active', live],
    ['disabled', { ...live, isActive: false }],
    ['used-up', { ...live, usageLimit: 1, usedCount: 1 }],
    [
      'scheduled',
      { startsAt: new Date(Date.now() + DAY), expiresAt: new Date(Date.now() + 2 * DAY) },
    ],
    [
      'expired',
      { startsAt: new Date(Date.now() - 2 * DAY), expiresAt: new Date(Date.now() - DAY) },
    ],
  ])('is "%s"', (state, overrides) => {
    expect(coupon(overrides).state).toBe(state);
  });

  it('appears in the JSON sent to clients', () => {
    expect(coupon().toJSON()).toHaveProperty('state');
  });
});

describe('calcTotals (pricing with a discount)', () => {
  it('adds shipping below the free-shipping minimum', () => {
    expect(calcTotals(4000, 400)).toEqual({
      itemsPrice: 4000,
      discountPrice: 400,
      shippingPrice: PRICING.SHIPPING_FEE,
      taxPrice: 0,
      totalPrice: 3600 + PRICING.SHIPPING_FEE,
    });
  });

  it('judges free shipping on the amount AFTER the discount', () => {
    // Rs 5,200 alone ships free; with Rs 500 off it is Rs 4,700, so shipping is charged again
    expect(calcTotals(5200).shippingPrice).toBe(0);
    expect(calcTotals(5200, 500).shippingPrice).toBe(PRICING.SHIPPING_FEE);
  });

  it('defaults the discount to 0', () => {
    expect(calcTotals(6000)).toMatchObject({ discountPrice: 0, totalPrice: 6000 });
  });

  it('charges nothing for an empty cart', () => {
    expect(calcTotals(0)).toMatchObject({ shippingPrice: 0, totalPrice: 0 });
  });

  it('never ends below zero when the discount covers everything', () => {
    expect(calcTotals(300, 300).totalPrice).toBe(0);
    expect(calcShipping(0)).toBe(0);
  });
});
